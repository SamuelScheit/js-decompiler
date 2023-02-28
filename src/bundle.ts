import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import fs from "fs";
import { astNames, cache } from "./worker";
import generate from "@babel/generator";
import { client } from "./storage/redis";
import { Collection } from "@discordjs/collection";
import { parseOptions } from "./constants";
import { getJSXNode } from "./jsx";
import { degenerate } from "./generator";
import { isUnequalOperator, isVariable, isEqualOperator, isUndefined, isEqual } from "./ast";

// const code = fs.readFileSync(__dirname + "/../assets/e948f6857bd5d73d170f.js", "utf8");
// const code = fs.readFileSync(__dirname + "/../assets/0a996e09af7f3fb26a7b.js", "utf8");

// client.connect();

async function isNodeModule(names: string[]) {
	const entries = await cache.getMultiple(names);
	const matches = new Collection<string, number>();

	for (const index in names) {
		const packages = entries[index];
		if (!packages) continue;

		for (const pkg of packages.split(",")) {
			const count = matches.get(pkg) || 0;
			matches.set(pkg, count + 1);
		}
	}

	var packages = matches.sorted((a, b) => b - a);
	packages = packages.filter((v, k) => v === packages.first());
	if (packages.size === 0) return;

	const percentage = packages.first()! / names.length;
	if (percentage < 1) return;

	return true;
}

export type NodeModule = NodePath<t.ObjectProperty & { key: t.NumericLiteral; value: { body: t.BlockStatement } }>;

async function processModule(path: NodeModule) {
	const moduleID = path.node.key.value;
	const module = path.node.value.body.body;

	const names = Array.from(new Set(astNames(t.file(t.program(module))).filter((x) => x.length >= 2)));
	console.log(moduleID, names.length);

	const isNode = await isNodeModule(names);
	if (!isNode) return;

	path.parentPath.remove();
}

function isModuleExpression(path: NodePath) {
	return (
		path.isObjectProperty() &&
		t.isNumericLiteral(path.node.key) &&
		t.isArrowFunctionExpression(path.node.value) &&
		path.node.value.params.length <= 3 &&
		path.node.value.params.length >= 2 &&
		t.isBlockStatement(path.node.value.body)
	);
}

async function stripModules(ast: t.File) {
	const tasks = [] as Promise<any>[];
	traverse(ast, {
		enter(path) {
			if (!isModuleExpression(path)) return;

			path.skip();

			tasks.push(processModule(path as NodeModule));
		},
	});
	await Promise.all(tasks);

	return ast;
}

async function simplify(ast: t.File) {
	traverse(ast, {
		enter(path) {
			degenerate(path)
		},
		CallExpression(path) {
			// replace createElement with JSX
			const node = getJSXNode(path.node);
			if (node === null) return null;
			path.replaceWith(node);
		},
		UnaryExpression(path) {
			// void 0 => undefined
			if (
				path.node.operator === "void" &&
				t.isNumericLiteral(path.node.argument) &&
				path.node.argument.value === 0
			) {
				path.replaceWith(t.identifier("undefined"));
			}
		},
		FunctionExpression(path) {
			// function() {} => () => {}
			if (path.node.generator) return;
			let hasThis = false;
			path.traverse({
				ThisExpression(path) {
					hasThis = true;
				},
				Function(path) {
					path.skip()
				}
			});
			if (hasThis) return;

			path.replaceWith(t.arrowFunctionExpression(path.node.params, path.node.body, path.node.async));
		},
		SequenceExpression(path) {
			// (0, x) => x
			const expressions = path.get("expressions");

			if (expressions.length === 2 && expressions[0].isNumericLiteral({ value: 0 })) {
				path.replaceWith(expressions[1]);
			}
		},
		ConditionalExpression(path) {
			//    . !== . ? a : b
			// => . === . ? b : t
			// consistent logical expressions

			const test = path.get("test");
			const alternate = path.get("alternate");
			const consequent = path.get("consequent");

			if (test.isBinaryExpression() && isUnequalOperator(test.node.operator)) {
				test.node.operator = "===";
				path.node.consequent = alternate.node;
				path.node.alternate = consequent.node;
			}
		},
	});

	traverse(ast, {
		LogicalExpression(path) {
			const left = path.get("left");
			const right = path.get("right");
			// null != e && (e = ...)
			if (
				path.node.operator === "&&" &&
				left.isBinaryExpression() &&
				left.node.operator === "!=" &&
				left.get("left").isNullLiteral() &&
				isVariable(left.get("right")) &&
				right.isAssignmentExpression()
			) {
				right.node.operator = "||=";
				path.replaceWith(right);
			}
		},
		ConditionalExpression(path) {
			const test = path.get("test");
			const consequent = path.get("consequent");
			const alternate = path.get("alternate");
			// null == t ? undefined : t.test
			if (
				test.isBinaryExpression() &&
				isEqualOperator(test.node.operator) &&
				isUndefined(test.get("left")) &&
				isVariable(test.get("right")) &&
				isUndefined(consequent) &&
				alternate.isMemberExpression() &&
				alternate.node.property.type !== "PrivateName"
			) {
				path.replaceWith(
					t.optionalMemberExpression(alternate.node.object, alternate.node.property, false, true)
				);
				return;
			}

			// null === b ? a : b => a ?? b
			if (
				test.isBinaryExpression() &&
				isEqualOperator(test.node.operator) &&
				((isUndefined(test.get("left")) && isEqual(test.get("right").node, alternate.node)) ||
					(isUndefined(test.get("right")) && isEqual(test.get("left").node, alternate.node)))
			) {
				path.replaceWith(t.logicalExpression("??", alternate.node, consequent.node));
				return;
			}

			// path.replaceWith(
			// 	t.ifStatement(
			// 		path.node.test,
			// 		t.expressionStatement(path.node.consequent),
			// 		t.expressionStatement(path.node.alternate)
			// 	)
			// );
		},
	});

	traverse(ast, {
		Identifier(path) {
			// eager evaluate variables and replace them
			const binding = path.scope.getBinding(path.node.name);
			if (!binding) return;
			if (binding.identifier === path.node) return;
			if (path.parentPath?.isFunctionDeclaration()) return;
			if (!binding.path.isVariableDeclarator()) return;

			const initalizer = binding.path.get("init");
			if (!initalizer.node) return;
			if (!initalizer.isMemberExpression() && !initalizer.isLiteral() && !initalizer.isOptionalMemberExpression())
				return;

			if (path.parentPath.isAssignmentExpression() && path.parentPath.node.left === path.node) return;
			if (path.parentPath.isMemberExpression()) {
				return;
			}
			if (path.parentPath.isUpdateExpression()) return;
			if (path.parentPath.isObjectProperty() && path.parentKey === "key") {
				return;
			}
			binding.references--;
			if (binding.references <= 0) {
				binding.path.remove();
			}

			path.replaceWith(initalizer.node);
		},
	});

	return ast;
}

async function main(code: string) {
	const ast = parse(code, parseOptions);

	// await stripModules(ast);
	await simplify(ast);
	console.log("done");

	const stripped = generate(ast).code;
	fs.writeFileSync(__dirname + `/../result/file.js`, stripped);
	fs.writeFileSync(__dirname + "/../ast.json", JSON.stringify(ast, null, "\t"));
}

// main(fs.readFileSync(__dirname + "/../assets/1cfddfc1ccaeae49522e.js", "utf8"));

async function test() {
	const code = fs.readFileSync(__dirname + "/../result/generator.js", "utf8");
	const ast = parse(code, parseOptions);
	fs.writeFileSync(__dirname + "/../result/ast.json", JSON.stringify(ast, null, "\t"));

	await simplify(ast);

	const stripped = generate(ast).code;

	fs.writeFileSync(__dirname + "/../result/code.js", stripped);
}

test();
