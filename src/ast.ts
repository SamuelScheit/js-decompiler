import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

export function isUndefined(node: NodePath) {
	return (
		node.isNullLiteral() ||
		(node.isIdentifier() && node.node.name === "undefined") ||
		(node.isUnaryExpression() &&
			node.node.operator === "void" &&
			node.get("argument").isNumericLiteral({ value: 0 }))
	);
}

export function isVariable(node: NodePath) {
	return node.isIdentifier() || node.isMemberExpression() || node.isOptionalMemberExpression();
}

export function isEqualOperator(operator: t.BinaryExpression["operator"]) {
	return operator === "==" || operator === "===";
}

export function isUnequalOperator(operator: t.BinaryExpression["operator"]) {
	return operator === "!=" || operator === "!==";
}

export function isEqual(left: any, right: any) {
	if (left === right) return true;
	if (left == null || right == null) return false;
	if (typeof left !== "object" || typeof right !== "object") return false;
	for (const key of Object.keys(left)) {
		if (key === "loc" || key == "start" || key === "end") continue;

		if (!isEqual(left[key], right[key])) return false;
	}

	return true;
}
