const { minify } = require("terser");

var code = `
const test = async function test() {
	console.log("test");
	await main();
}

test();
`;

async function main() {
	var result = await minify(code, { sourceMap: true, compress: true, mangle: true, ecma: 5 });
	console.log(result.code); // minified output: function add(n,d){return n+d}
}

main();
