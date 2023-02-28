import * as t from "@babel/types"

export function getJSXNode(node: t.CallExpression): t.JSXElement | null {
	if (!isReactCreateElement(node)) return null;

	//nameNode and propsNode may be undefined, getJSX* need to handle that
	const [nameNode, propsNode, ...childNodes] = node.arguments;

	const name = getJSXName(nameNode);
	if (name === null) return null; //name is required

	const props = getJSXProps(propsNode);
	if (props === null) return null; //no props → [], invalid → null

	const children = getJSXChildren(childNodes);
	if (children === null) return null; //no children → [], invalid → null

	// self-closing tag if no children
	const selfClosing = children.length === 0;
	const startTag = t.jSXOpeningElement(name, props, selfClosing);
	const endTag = selfClosing ? null : t.jSXClosingElement(name);

	return t.jSXElement(startTag, endTag, children, selfClosing);
}

/** Get a JSXIdentifier or JSXMemberExpression from a Node of known type.
 * Returns null if a unknown node type, null or undefined is passed. */
function getJSXName(node: t.Node): t.JSXIdentifier | t.JSXMemberExpression | null {
	if (node == null) return null;

	const name = getJSXIdentifier(node);
	if (name !== null) return name;

	if (!t.isMemberExpression(node)) return null;
	const object = getJSXName(node.object);
	const property = getJSXName(node.property);
	if (object === null || property === null) return null;
	return t.jSXMemberExpression(object, property as t.JSXIdentifier);
}

/** Get a array of JSX(Spread)Attribute from a props ObjectExpression.
 * Handles the _extends Expression babel creates from SpreadElement nodes.
 * Returns null if a validation error occurs. */
function getJSXProps(node: t.Node): Array<t.JSXAttribute | t.JSXSpreadAttribute> | null {
	if (node == null || isNullLikeNode(node)) return [];

	if (t.isCallExpression(node) && t.isIdentifier(node.callee, { name: "_extends" })) {
		const props = node.arguments.map(getJSXProps);
		//if calling this recursively works, flatten.
		if (props.every((prop) => prop !== null)) return [].concat.apply([], props as any);
	}

	if (!t.isObjectExpression(node) && t.isExpression(node)) return [t.jSXSpreadAttribute(node)];

	if (!isPlainObjectExpression(node)) return null;

	return (node as t.ObjectExpression).properties.map((prop) =>
		t.isObjectProperty(prop)
			? t.jSXAttribute(getJSXIdentifier(prop.key)!, getJSXAttributeValue(prop.value))
			: t.jSXSpreadAttribute((prop as t.SpreadElement).argument)
	);
}

function getJSXChild(node: t.Node) {
	if (t.isStringLiteral(node)) return t.jSXText(node.value);
	if (isReactCreateElement(node)) return getJSXNode(node as t.CallExpression);
	if (t.isExpression(node)) return t.jSXExpressionContainer(node);
	return null;
}

function getJSXChildren(nodes: t.Node[]) {
	const children = nodes.filter((node) => !isNullLikeNode(node)).map(getJSXChild);
	if (children.some((child) => child == null)) return null;
	return children as (t.JSXElement | t.JSXExpressionContainer | t.JSXText)[];
}

function getJSXIdentifier(node: t.Node) {
	//TODO: JSXNamespacedName
	if (t.isIdentifier(node)) return t.jSXIdentifier(node.name);
	if (t.isStringLiteral(node)) return t.jSXIdentifier(node.value);
	return null;
}

function getJSXAttributeValue(node: t.Node) {
	if (t.isStringLiteral(node)) return node;
	if (t.isJSXElement(node)) return node;
	if (t.isExpression(node)) return t.jSXExpressionContainer(node);
	return null;
}

/** tests if a node is a CallExpression with callee “React.createElement” */
const isReactCreateElement = (node: t.Node) =>
	t.isCallExpression(node) &&
	t.isMemberExpression(node.callee) &&
	t.isIdentifier(node.callee.property, { name: "createElement" }) &&
	!node.callee.computed;

/** Tests if a node is “null” or “undefined” */
const isNullLikeNode = (node: t.Node) => t.isNullLiteral(node) || t.isIdentifier(node, { name: "undefined" });

/** Tests if a node is an object expression with noncomputed, nonmethod attrs */
const isPlainObjectExpression = (node: t.Node) =>
	t.isObjectExpression(node) &&
	node.properties.every(
		(m) =>
			t.isSpreadElement(m) ||
			(t.isObjectProperty(m, { computed: false }) &&
				getJSXIdentifier(m.key) !== null &&
				getJSXAttributeValue(m.value) !== null)
	);