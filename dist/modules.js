"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const webpack_1 = __importDefault(require("webpack"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
const cache_modules = path_1.default.join(__dirname, "..", "cache", "node_modules");
const node_modules = path_1.default.join(__dirname, "..", "node_modules");
const assets = path_1.default.join(__dirname, "..", "assets");
const input = path_1.default.join(__dirname, "..", "input");
fs_1.default.mkdirSync(cache_modules, { recursive: true });
fs_1.default.mkdirSync(node_modules, { recursive: true });
function copyRecursiveSync(src, dest) {
    var exists = fs_1.default.existsSync(src);
    if (!exists)
        return;
    var stats = fs_1.default.statSync(src);
    var isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
        fs_1.default.mkdirSync(dest);
        fs_1.default.readdirSync(src).forEach(function (childItemName) {
            copyRecursiveSync(path_1.default.join(src, childItemName), path_1.default.join(dest, childItemName));
        });
    }
    else {
        fs_1.default.copyFileSync(src, dest);
    }
}
copyRecursiveSync(assets, input);
function getEntryPath(node_module_path) {
    const packageJson = require(path_1.default.join(node_module_path, "package.json"));
    try {
        return require.resolve(path_1.default.join(node_module_path, packageJson.main || "index.js"));
    }
    catch (error) {
        return false;
    }
}
const entries = fs_1.default.readdirSync(node_modules).map((node_module) => {
    if (node_module.startsWith("."))
        return;
    if (node_module.startsWith("@types"))
        return;
    if (node_module.startsWith("@")) {
        return fs_1.default.readdirSync(path_1.default.join(node_modules, node_module)).map((x) => {
            getEntryPath(path_1.default.join(node_modules, node_module, x));
        });
    }
    return getEntryPath(path_1.default.join(node_modules, node_module));
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
    if (!x)
        return false;
    return !excluded.some((y) => x.includes(y));
});
fs_1.default.writeFileSync(path_1.default.join(__dirname, "..", "modules.json"), JSON.stringify(entry, null, "\t"));
(0, webpack_1.default)({
    mode: "production",
    target: "web",
    entry: entry,
    devtool: "source-map",
    output: {
        filename: "[name].js",
        path: path_1.default.join(cache_modules),
    },
    plugins: [
        new webpack_1.default.NormalModuleReplacementPlugin(/^node:/, (resource) => {
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
                    name(module) {
                        if (!module.context)
                            return;
                        // get the name. E.g. node_modules/packageName/not/this/part.js
                        // or node_modules/packageName
                        const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/);
                        if (!packageName)
                            return;
                        // npm package names are URL-safe, but some servers don't like @ symbols
                        return packageName[1];
                    },
                },
            },
        },
    },
}, (err, stats) => {
    if (err)
        return console.error(err);
    if (stats?.hasErrors())
        return console.error(stats.toString());
    console.log("Compiled successfully: " + stats);
});
