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

export function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// const code = fs.readFileSync(__dirname + "/../assets/e948f6857bd5d73d170f.js", "utf8");
// const code = fs.readFileSync(__dirname + "/../assets/0a996e09af7f3fb26a7b.js", "utf8");

const modules = new Map<number, string>();

async function getNodeModule(names: string[]) {
	if (names.length === 0) return;
	const entries = await cache.getMultiple(names);
	const matches = new Collection<string, number>();

	for (let i = 0; i < names.length; i++) {
		const packages = entries[i];
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

	return packages.firstKey();
}

export type NodeModule = NodePath<t.ObjectProperty & { key: t.NumericLiteral; value: { body: t.BlockStatement } }>;

async function processModule(path: NodeModule) {
	const moduleID = path.node.key.value;
	const module = path.node.value.body.body;

	const names = Array.from(new Set(astNames(t.file(t.program(module))).filter((x) => x.length >= 2)));
	console.log(moduleID, names.length);

	const name = await getNodeModule(names);
	if (!name) return;

	modules.set(moduleID, name);

	path.remove();
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
	await simplify(ast);
	await Promise.all(tasks);

	traverse(ast, {
		// @ts-ignore
		enter(path: NodePath<t.ObjectProperty & { key: t.NumericLiteral }>) {
			if (!isModuleExpression(path)) return;

			path.skip();

			const func = path.get("value") as NodePath<t.ArrowFunctionExpression>;
			if (func.node.body.type !== "BlockStatement") return;

			const [win, moduleT, webpack] = func.node.params;
			const moduleId = path.node.key.value;
			const moduleName = modules.get(moduleId) || moduleId;
			if (!t.isIdentifier(win) || !t.isIdentifier(moduleT) || !t.isIdentifier(webpack)) return;

			const binding = func.scope.getBinding(webpack.name);
			if (!binding) return;

			binding.referencePaths.forEach((ref) => {
				if (ref.parentPath?.isMemberExpression() && ref.parentPath.parentPath.isCallExpression()) {
					const [, exports] = ref.parentPath.parentPath.get("arguments");
					if (!exports || !exports.isObjectExpression()) return;

					exports.get("properties").forEach((x) => {
						if (x.node.type === "ObjectMethod" || x.node.type === "SpreadElement") return;
						if (x.node.key.type !== "Identifier") return;
						if (x.node.value.type !== "ArrowFunctionExpression") return;
						if (x.node.value.body.type !== "Identifier") return;
						const variable = func.scope.getBinding(x.node.value.body.name);
						if (!variable) return t.exportSpecifier(x.node.value.body, x.node.key);
						if (
							variable.path.node.type !== "FunctionDeclaration" &&
							variable.path.node.type !== "VariableDeclaration"
						) {
							if (variable.path.node.type !== "VariableDeclarator") {
								return;
							}

							if (variable.path.parentPath?.parentPath?.isExportNamedDeclaration()) return;

							variable.path = variable.path.parentPath!;
						}

						variable.path.replaceWith(t.exportNamedDeclaration(variable.path.node as any));
					});

					exports.parentPath.remove();
				}
				if (ref.parentPath?.isCallExpression() && ref.parentPath.parentPath.isVariableDeclarator()) {
					const args = ref.parentPath.node.arguments;
					if (args.length !== 1) return;
					if (args[0].type !== "NumericLiteral") return;
					if (ref.parentPath.parentPath.node.id?.type !== "Identifier") return;
					const mod = modules.get(args[0].value) || args[0].value;

					const impo = t.importDeclaration(
						[t.importDefaultSpecifier(ref.parentPath.parentPath.node.id)],
						t.stringLiteral("./" + mod)
					);
					(func.node.body as t.BlockStatement).body.unshift(impo);

					if (ref.parentPath.parentPath.isVariableDeclarator()) {
						const x = ref.parentPath.parentPath.parentPath;
						if (!x.removed) x.remove();
					}
				}
			});

			fs.writeFileSync(
				__dirname + "/../result/" + moduleName + ".js",
				generate(t.program(func.node.body.body)).code
			);
		},
	});

	return ast;
}

async function simplify(ast: t.File) {
	traverse(ast, {
		enter(path) {
			degenerate(path);
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
					path.skip();
				},
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
				// @ts-ignore
				alternate.node.type = "OptionalMemberExpression";
				path.replaceWith(
					alternate.node
					// t.optionalMemberExpression(alternate.node.object, alternate.node.property, false, true)
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

async function decompile(code: string) {
	const ast = parse(code, parseOptions);

	await stripModules(ast);
	console.log("done");

	// const stripped = generate(ast).code;
	// fs.writeFileSync(__dirname + `/../result/file.js`, stripped);
	// fs.writeFileSync(__dirname + "/../ast.json", JSON.stringify(ast, null, "\t"));
}

async function test() {
	const code = fs.readFileSync(__dirname + "/../result/input.js", "utf8");
	const ast = parse(code, parseOptions);
	fs.writeFileSync(__dirname + "/../result/ast.json", JSON.stringify(ast, null, "\t"));

	await simplify(ast);

	const stripped = generate(ast).code;

	fs.writeFileSync(__dirname + "/../result/code.js", stripped);
}

async function main() {
	await client.connect();

	for (const file of fs.readdirSync(__dirname + "/../assets")) {
		if (!file.endsWith(".js")) continue;
		// await sleep(1000);
		await decompile(fs.readFileSync(__dirname + `/../assets/${file}`, "utf8"));
	}
}

main();
