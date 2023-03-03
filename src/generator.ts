import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Collection } from "@discordjs/collection";
import "./util";

enum TypeScriptOpCode {
	Nop = 0,
	Return = 2, // A completion instruction for the `return` keyword
	Break = 3, // A break instruction used to jump to a label
	Yield = 4, // A completion instruction for the `yield` keyword
	Endfinally = 7, // Marks the end of a `finally` block
	Try = 8, // Marks the start of a `try` block
	Catch = 9, // Marks the start of a `catch` block
	Finally = 10, // Marks the start of a `finally` block
	EndBlock = 11, // Marks the start of a `finally` block
}

export function getTSGenerator(path: NodePath) {
	if (!path.isStringLiteral()) return;
	if (path.node.value !== "Generator is already executing.") return;

	const step = path.findParent((x) => {
		return x.isDeclaration();
	});
	if (!step) return;

	const generator = step.findParent((x) => {
		return x.isVariableDeclarator() || x.isFunctionDeclaration();
	});
	if (!generator) return;

	const id = generator.get("id") as NodePath<t.LVal>;
	if (!id.isIdentifier()) return;

	return generator.scope.getBinding(id.node.name);
}

/**
 * switch (o.label) {
 * 	case 0:
 * 		// return
 * 		return [2, 1];
 *  case 1:
 * 		...
 */

export type CasePath = NodePath<t.SwitchCase>;

type Case = {
	path: CasePath;
	number: number;
	result?: NodePath;
	try?: number;
	catch?: number;
	finally?: number;
	next?: number;
	links: {
		type: TypeScriptOpCode;
		next?: number;
		promise?: NodePath;
		path: NodePath;
	}[];
};

function getCycles(cases: Collection<number, Case>) {
	const cycles = new Collection<number, number[]>();
	const all = new Set<number>(cases.map((x) => x.number));

	function getCycle(c: Case, seen = new Set<number>()) {
		seen.add(c.number);

		c.links.forEach((x) => {
			const next = cases.get(x.next!);
			if (!next) return;

			if (seen.has(x.next!)) {
				const exists = cycles.get(x.next!);
				const nums = [...seen].filter((x) => x > next.number);
				for (const x of nums) {
					all.delete(x);
				}
				if (cycles.has(x.next!)) {
					cycles.set(
						x.next!,
						[...exists!, ...nums].unique().sort((x, y) => x - y)
					);
					return;
				}
				return cycles.set(x.next!, nums);
			}

			getCycle(next, new Set([...seen]));
		});

		return seen;
	}

	const first = cases.first()!;
	getCycle(first);
	cycles.set(-1, [...all]);
	cycles.sort((_, __, a, b) => a - b);

	return cycles;
}

// detect if/else branches in cases with c.next
function getBranches(cases: Collection<number, Case>) {
	const branches = new Collection<number, number>();
	const cycles = getCycles(cases);

	function getBranch(c: Case): boolean {
		c.links.forEach((x) => {
			const next = cases.get(x.next!);
			if (!next) return;
			if (x.type !== TypeScriptOpCode.Break) return;
			if (cycles.has(x.next!)) return;
			if (cycles.has(c.number)) return;
			if (x.next! <= c.number) return;

			branches.set(c.number, x.next!);
		});

		return false;
	}

	cases.forEach((x) => getBranch(x));
	branches.sort((_, __, a, b) => a - b);

	return branches;
}

export function degenerate(path: NodePath) {
	if (!path.isSwitchStatement()) return;

	const discriminant = path.get("discriminant");
	if (!discriminant.isMemberExpression()) return;

	const property = discriminant.get("property");
	if (!property.isIdentifier()) return;
	if (property.node.name !== "label") return;
	// case must use the .label property

	const object = discriminant.get("object");
	if (!object.isIdentifier()) return;
	const binding = object.scope.getBinding(object.node.name);
	if (!binding) return;

	const wrapper = path.find((x) => x.isFunction()) as NodePath<t.Function>;
	if (!wrapper) return;
	if (binding.path.parent !== wrapper.node) return;
	if (wrapper.isFunction()) {
		wrapper.node.async = true;
	}
	// case must use the variable of the function scope
	const cases = new Collection<number, Case>();
	const trys = new Map<number, number>();
	const catches = new Map<number, number>();
	const finallys = new Map<number, number>();

	path.get("cases").forEach((step) => {
		const test = step.get("test");
		if (!test.isNumericLiteral()) return;

		const number = test.node.value;
		let opcode: TypeScriptOpCode = 0;
		let promise: NodePath | undefined;
		let next: number | undefined;
		let links = [] as Case["links"];
		let result: NodePath | undefined;
		let _try = trys.get(number);
		let _catch = catches.get(number);
		let _finally = finallys.get(number);

		if (_try) {
			links.push({
				type: TypeScriptOpCode.EndBlock,
				next: _try,
				path: step,
			});
			_try = undefined;
		}
		if (_catch) {
			links.push({
				type: TypeScriptOpCode.EndBlock,
				next: _catch,
				path: step,
			});
			_catch = undefined;
		}
		if (_finally) {
			links.push({
				type: TypeScriptOpCode.EndBlock,
				next: _finally,
				path: step,
			});
			_finally = undefined;
		}

		function ReturnStatement(x: NodePath<t.ReturnStatement>) {
			const argument = x.get("argument");
			if (argument.isConditionalExpression()) {
				const ifStatement = t.ifStatement(
					argument.get("test").node,
					t.returnStatement(argument.get("consequent").node),
					t.returnStatement(argument.get("alternate").node)
				);

				x.replaceWith(ifStatement);

				const ifX = x as unknown as NodePath<t.IfStatement>;

				ReturnStatement(ifX.get("consequent") as NodePath<t.ReturnStatement>);
				ReturnStatement(ifX.get("alternate") as NodePath<t.ReturnStatement>);
				return;
			}
			if (!argument.isArrayExpression()) return;

			const elements = argument.get("elements").filter((x) => x) as NodePath<t.SpreadElement | t.Expression>[];
			if (elements.length > 2) return;

			const [op, value] = elements;
			if (!op?.isNumericLiteral()) return;
			opcode = op.node.value as TypeScriptOpCode;

			if (value?.isNumericLiteral()) {
				next = value.node.value;
				x.node.argument = null;
			} else if (opcode === TypeScriptOpCode.Return) {
				promise = value;
			} else if (opcode === TypeScriptOpCode.Yield) {
				promise = value;
				next = number + 1;
			} else if (opcode === TypeScriptOpCode.Endfinally) {
				next = number + 1;
				_finally = number;
			}

			links.push({ type: opcode, next, promise, path: x });
		}
		step.traverse({ ReturnStatement });

		const binding = step.scope.getBinding(object.node.name);

		binding?.referencePaths.forEach((bind) => {
			const label = bind.find(
				(x) => x.isAssignmentExpression() && step.isAncestor(x)
			) as NodePath<t.AssignmentExpression>;
			const call = bind.find((x) => x.isCallExpression() && step.isAncestor(x)) as NodePath<t.CallExpression>;

			if (label) {
				const next = label.get("right");
				if (next.isNumericLiteral()) {
					links.push({ type: TypeScriptOpCode.Nop, next: next.node.value, path: label });
					// label.remove();
				}
			}
			if (call) {
				const callee = call.get("callee");
				if (!callee.isMemberExpression()) return;

				const property = callee.get("property");
				if (!property.isIdentifier()) return;

				const name = property.node.name;

				if (name === "push") {
					// try catch
					const [arr] = call.get("arguments");
					if (!arr?.isArrayExpression()) return;
					const [try_, catch_, finally_, next_] = arr.get("elements");
					_try = try_?.isNumericLiteral() ? try_.node.value : undefined;
					_catch = catch_?.isNumericLiteral() ? catch_.node.value : undefined;
					_finally = finally_?.isNumericLiteral() ? finally_.node.value : undefined;
					next = next_?.isNumericLiteral() ? next_.node.value : undefined;
					// @ts-ignore

					if (_try) _try++;
					if (_catch) {
						trys.set(_catch - 1, next!);
					}
					if (_finally) {
						if (_catch) catches.set(_finally - 1, next!);
						else trys.set(_finally - 1, next!);
					}
					if (next) {
						finallys.set(next - 1, next);
					}

					// links.push({ type: TypeScriptOpCode.Try, next, path: call });
				} else if (name === "sent") {
					// await promise
					result = call;
				}
			}
		});

		cases.set(number, {
			path: step as any,
			number,
			links,
			result,
			try: _try,
			catch: _catch,
			finally: _finally,
			next,
		});
	});

	console.dir(
		cases.map((x) => ({
			number: x.number,
			links: x.links.map((x) => ({ type: x.type, next: x.next })),
			t: x.try,
			c: x.catch,
			f: x.finally,
			n: x.next,
		})),
		{ depth: null, breakLength: 140 }
	);

	const branches = getBranches(cases);
	console.log("branches", branches);

	const cycles = getCycles(cases);
	console.log("cycles", cycles);

	function recursive(num: number): t.Statement[] {
		const cycle = cycles.get(num);
		const branch = branches.get(num);
		const c = cases.get(num);
		if (!c) return [];
		var node = getCase(c);

		if (c.links.some((x) => x.type === TypeScriptOpCode.EndBlock)) return node;

		if (cycle !== undefined) {
			const stmt = recursive(cycle[0]);
			stmt.unshift(...node);

			return [t.whileStatement(t.identifier("true"), t.blockStatement(stmt))];
		}
		if (c.try) {
			return [
				t.tryStatement(
					t.blockStatement(recursive(c.try!)),
					t.catchClause(t.identifier("e"), t.blockStatement(recursive(c.catch!))),
					t.blockStatement(recursive(c.finally!))
				),
				...recursive(c.next!),
			];
		}
		if (branch !== undefined) {
			const link = c.links.find((x) => x.next === branch);
			if (!link) return [];
			const if_ = link?.path.find((x) => x.isIfStatement()) as NodePath<t.IfStatement>;
			console.log("branch", num, link?.next);
			const next = recursive(link!.next!);

			if (if_) {
				if_.node.consequent = t.blockStatement(next);
				const alternate = c.links.find((x) => x.next !== branch);
				if (alternate) if_.node.alternate = t.blockStatement(recursive(alternate.next!));

				return node;
			}

			return [...node, ...next];
		}

		if (c.links[0]?.next! < num) return node;

		return [...node, ...recursive(c.links[0]?.next!)];
	}

	const result = recursive(cycles.first()![0]);
	const parent = path.find((x) => x.isFunctionExpression()) as NodePath<t.FunctionExpression>;
	if (!parent) return;

	const variables = parent.node.body.body.filter((x) => x.type === "VariableDeclaration");
	const head = parent.findParent((x) => x.isCallExpression()) as NodePath<t.CallExpression>;
	head?.replaceWith(t.functionExpression(null, [], t.blockStatement([...variables, ...result]), false, true));

	function getCase(c: Case) {
		if (!c) return c;
		const x = c.path.node.consequent;

		c.links.forEach((x) => {
			const next = cases.get(x.next!);

			if (x.promise && next?.result) {
				next.result.replaceWith(t.awaitExpression(x.promise.node as any));
			}

			if (x.type === TypeScriptOpCode.Yield) {
				if (!x.path.removed) x.path.remove();
			} else if (x.type === TypeScriptOpCode.Break) {
				const partOfCycle = cycles.filter((x, k) => k !== -1).some((c) => c.includes(x.next!));

				if (cycles.get(x.next!) || partOfCycle || c.finally || c.catch || c.try) {
					if (!x.path.removed) x.path.remove();
				} else {
					x.path.replaceWith(t.breakStatement());
				}
			} else if (x.type === TypeScriptOpCode.Return) {
				x.path.replaceWith(t.returnStatement(x.promise?.node as t.Expression));
			} else if (x.type === TypeScriptOpCode.Endfinally) {
				if (!x.path.removed) x.path.remove();
			} else if (x.type === TypeScriptOpCode.Nop) {
				if (!x.path.removed) x.path.remove();
			} else if (x.type === TypeScriptOpCode.EndBlock) {
			}
		});

		return x;
	}
}
