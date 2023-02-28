const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
	mode: "production",
	entry: "./input.ts",
	output: {
		path: path.resolve(__dirname, "."),
		filename: "webpack.js",
	},
	optimization: {
		minimize: true,
		minimizer: [new TerserPlugin({ extractComments: false })],
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: {
					loader: "babel-loader",
					options: {
						presets: [["@babel/preset-env", {}]],
					},
				},
			},
		],
	},
};
