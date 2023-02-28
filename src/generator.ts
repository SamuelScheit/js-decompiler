import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Collection } from "@discordjs/collection";

enum TypeScriptOpCode {
	Nop = 0,
	Return = 2, // A completion instruction for the `return` keyword
	Break = 3, // A break instruction used to jump to a label
	Yield = 4, // A completion instruction for the `yield` keyword
	Endfinally = 7, // Marks the end of a `finally` block
	Try = 10,
	Catch = 11,
	Finally = 12,
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
	try?: boolean | number;
	catch?: boolean | number;
	finally?: boolean | number;
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
				const nums = [...seen].filter((x) => x > next.number);
				for (const x of nums) {
					all.delete(x);
				}
				if (cycles.has(x.next!)) {
					cycles.set(x.next!, [...new Set([...cycles.get(x.next!)!, ...nums])].sort());
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
		let _try: number | boolean | undefined;
		let _catch: number | boolean | undefined;
		let _finally: number | boolean | undefined;
		let _if: number | boolean | undefined;

		if (trys.has(number)) {
			links.push({
				path: step,
				type: TypeScriptOpCode.Try,
				next: trys.get(number),
			});
			_try = true;
		}
		if (catches.has(number)) {
			links.push({
				path: step,
				type: TypeScriptOpCode.Catch,
				next: catches.get(number),
			});
			_catch = true;
		}
		if (finallys.has(number)) {
			links.push({
				path: step,
				type: TypeScriptOpCode.Finally,
				next: finallys.get(number),
			});
			_finally = true;
		}

		step.traverse({
			ReturnStatement(x) {
				const argument = x.get("argument");
				if (!argument.isArrayExpression()) return;

				const elements = argument.get("elements").filter((x) => x) as NodePath<
					t.SpreadElement | t.Expression
				>[];
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
					next = test.node.value + 1;
				} else if (opcode === TypeScriptOpCode.Endfinally) {
					next = test.node.value + 1;
					_finally = true;
					return;
				}

				links.push({ type: opcode, next, promise, path: x });
			},
		});

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
					label.remove();
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
					let next = next_?.isNumericLiteral() ? next_.node.value : undefined;
					// @ts-ignore

					if (_try) {
						if (cases.has(_try)) cases.get(_try)!.try = true;
						links.push({ type: TypeScriptOpCode.Try, next: _try, path: call });
					}
					if (_catch) {
						trys.set(_catch - 1, _try!);
						links.push({ type: TypeScriptOpCode.Catch, next: _catch, path: call });
					}
					if (_finally) {
						if (_catch) catches.set(_finally - 1, _catch);
						else trys.set(_finally - 1, _try!);
						finallys.set(next! - 1, _finally);
						links.push({ type: TypeScriptOpCode.Finally, next: _finally, path: call });
					}
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
		});
	});

	console.dir(
		cases.map((x) => ({
			number: x.number,
			links: x.links.map((x) => ({ type: x.type, next: x.next })),
			t: !!x.try,
			c: !!x.catch,
			f: !!x.finally,
		})),
		{ depth: null, breakLength: 140 }
	);

	const branches = getBranches(cases);
	console.log("branches", branches);

	const cycles = getCycles(cases);
	console.log("cycles", cycles);

	function recursive(nodes: number[]): t.BlockStatement {
		let x = [] as any[];

		for (const num of nodes) {
			const cycle = cycles.get(num);
			const branch = branches.get(num);
			const c = cases.get(num);
			if (!c) continue;
			if (cycle !== undefined) {
				const stmt = recursive(cycle);
				stmt.body.unshift(...getCase(c));
				stmt.body.splice(-1, 1);
				if (c.try != null) {
					x.push(t.tryStatement(stmt, null, null));
				} else if (c.catch != null) {
					x[x.length - 1].handler = t.catchClause(t.identifier("e"), stmt);
				} else if (c.finally != null) {
					x[x.length - 1].finalizer = stmt;
				} else {
					x.push(t.whileStatement(t.identifier("true"), stmt));
				}
				continue;
			}
			if (branch !== undefined) {
				const link = c.links.find((x) => x.next === branch);
				const if_ = link?.path.find((x) => x.isIfStatement())?.node as t.IfStatement;
				if (link && if_) {
					if_.consequent = t.blockStatement(getCase(c));
					if_.alternate = t.blockStatement(getCase(cases.get(link?.next!)!));
					x.push(if_);
					// console.log("branch", num, link.next);
				}

				continue;
			}

			x.push(...getCase(c));
		}

		return t.blockStatement(x);
	}

	const result = recursive(cycles.first()!);
	const parent = path.find((x) => x.isFunctionExpression()) as NodePath<t.FunctionExpression>;
	if (!parent) return;

	const variables = parent.node.body.body.filter((x) => x.type === "VariableDeclaration");
	const head = parent.findParent((x) => x.isCallExpression()) as NodePath<t.CallExpression>;
	if (!head) return;
	head.replaceWith(t.functionExpression(null, [], t.blockStatement([...variables, ...result.body])));

	function getCase(c: Case) {
		if (!c) return c;

		const x = c.path.node.consequent;

		c.links.forEach((x) => {
			const next = cases.get(x.next!);

			if (x.promise && next?.result) {
				next.result.replaceWith(t.awaitExpression(x.promise.node as any));
			}

			if (x.type === TypeScriptOpCode.Yield) {
				// x.path.remove();
			} else if (x.type === TypeScriptOpCode.Break) {
				x.path.replaceWith(t.breakStatement());
			} else if (x.type === TypeScriptOpCode.Return) {
				x.path.replaceWith(t.returnStatement(x.promise?.node as t.Expression));
			} else if (x.type === TypeScriptOpCode.Try) {
				x.path.remove();
			}

			// c.path.pushContainer("body", next.path.node);
			// c.path.get("body").push(next.path);
			// c.path.insertAfter(next.path.node)
		});

		return x;
	}

	// getCase(first);
}
