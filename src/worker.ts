import workerpool from "workerpool";
import { parse } from "@babel/parser";
import traverse, { Node } from "@babel/traverse";
import fs from "fs";
import { extractNPM } from "./npm";
import { client, RedisCache, RedisState } from "./storage/redis";

export const cache = new RedisCache();
export const state = new RedisState();

export function astNames(ast: Node) {
	const names = [] as string[];
	traverse(ast, {
		enter(path) {
			if (path.isStringLiteral()) {
				names.push(path.node.value);
			} else if (path.isIdentifier()) {
				names.push(path.node.name);
			}
		},
	});
	return names;
}

export function extractNames(code: string) {
	try {
		return astNames(
			parse(code, { strictMode: false, errorRecovery: true, plugins: ["jsx", "flow", "decorators", "exportDefaultFrom"] })
		);
	} catch (error) {
		return [];
	}
}

function extractNamesFile(file: string) {
	try {
		return extractNames(fs.readFileSync(file, { encoding: "utf8" }));
	} catch (error) {
		console.error(file, error);
		return [];
	}
}

async function extractNamesNPM(pkg: string) {
	try {
		client.isOpen || (await client.connect());
		const files = (await extractNPM(pkg, null, (file, code) => {
			return extractNames(code);
		})) as string[][];

		const names = new Set<string>(files.flat());
		for (const name of names) {
			await cache.add(name, pkg);
		}
		await state.add(pkg);
	} catch (error) {
		console.error(pkg, error);
	}
}

if (!workerpool.isMainThread) {
	workerpool.worker({
		extractNames,
		extractNamesFile,
		extractNamesNPM,
	});
}
