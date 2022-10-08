import webpack from "webpack";
import path from "path";
import fs from "fs";
import { copyRecursiveSync } from "./file";

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const cache_modules = path.join(__dirname, "..", "cache", "node_modules");
const node_modules = path.join(__dirname, "..", "node_modules");
const assets = path.join(__dirname, "..", "assets");
const input = path.join(__dirname, "..", "input");

fs.mkdirSync(cache_modules, { recursive: true });
fs.mkdirSync(node_modules, { recursive: true });

copyRecursiveSync(assets, input);

function getEntryPath(node_module_path: string) {
	const packageJson = require(path.join(node_module_path, "package.json"));
	try {
		return require.resolve(path.join(node_module_path, packageJson.main || "index.js"));
	} catch (error) {
		return false;
	}
}

const entries = fs.readdirSync(node_modules).map((node_module) => {
	if (node_module.startsWith(".")) return;
	if (node_module.startsWith("@types")) return;
	if (node_module.startsWith("@")) {
		return fs.readdirSync(path.join(node_modules, node_module)).map((x) => {
			getEntryPath(path.join(node_modules, node_module, x));
		});
	}

	return getEntryPath(path.join(node_modules, node_module));
});

const excluded = [
	"assert",
	"async_hooks",
	"babel",
	"buffer",
	"child_process",
	"constants",
	"crypto",
	"events",
	"fs",
	"http",
	"https",
	"jest",
	"metro",
	"net",
	"os",
	"path",
	"perf_hooks",
	"react-native",
	"read-pkg",
	"require-from-string",
	"require-uncached",
	"resolve-from",
	"rx-lite-aggregates",
	"sntp",
	"stack-utils",
	"stream",
	"terser",
	"thread-loader",
	"tls",
	"ts-pnp",
	"tsconfig",
	"tty",
	"typescript",
	"url",
	"util",
	"webpack",
	"worker_threads",
	"zlib",
	"console",
	"eslint",
	"copy-paste",
	"dgram",
	"yargs",
	"ora",
	"inquirer",
	"natives",
	"flow-typed",
	"prettier",
];

const entry = entries.flat().filter((x) => {
	if (!x) return false;
	return !excluded.some((y) => x.includes(y));
}) as string[];

fs.writeFileSync(path.join(__dirname, "..", "modules.json"), JSON.stringify(entry, null, "\t"));

webpack(
	{
		mode: "production",
		target: "web",
		entry: entry,
		devtool: "source-map",
		output: {
			filename: "[name].js",
			path: path.join(cache_modules),
		},
		plugins: [
			new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
				resource.request = resource.request.replace(/^node:/, "");
			}),
		],
		resolve: {
			fallback: {
				assert: false,
				buffer: false,
				child_process: false,
				cluster: false,
				constants: false,
				crypto: false,
				dns: false,
				domain: false,
				events: false,
				fs: false,
				http: false,
				http2: false,
				https: false,
				net: false,
				os: false,
				path: false,
				process: false,
				punycode: false,
				querystring: false,
				stream: false,
				string_decoder: false,
				timers: false,
				tls: false,
				tty: false,
				url: false,
				util: false,
				vm: false,
				zlib: false,
				module: false,
			},
		},
		externals: excluded,
		optimization: {
			splitChunks: {
				chunks: "all",
				maxInitialRequests: Infinity,
				minSize: 0,
				cacheGroups: {
					vendor: {
						name(module: any) {
							if (!module.context) return;
							// get the name. E.g. node_modules/packageName/not/this/part.js
							// or node_modules/packageName
							const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/);
							if (!packageName) return;
							// npm package names are URL-safe, but some servers don't like @ symbols
							return packageName[1];
						},
					},
				},
			},
		},
	},
	(err, stats) => {
		if (err) return console.error(err);
		if (stats?.hasErrors()) return console.error(stats.toString());

		console.log("Compiled successfully: " + stats);
	}
);
