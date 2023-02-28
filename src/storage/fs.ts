import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { JSONParse } from "../util";

export class FSCache extends Map<any, Set<string>> {
	static file = join(__dirname, "..", "cache.json");

	constructor(entries?: Iterable<readonly [any, Set<string>]>) {
		super(entries);
	}

	add(value: any, pkg: string) {
		if (this.has(value)) {
			this.get(value)!.add(pkg);
		} else {
			this.set(value, new Set([pkg]));
		}
	}

	save() {
		writeFileSync(FSCache.file, JSON.stringify(this));
	}

	toJSON() {
		return {
			__type: "Map",
			value: Array.from(this.entries()),
		};
	}

	static load() {
		try {
			const data = readFileSync(FSCache.file, { encoding: "utf8" });
			const json = JSONParse(data);
			return new FSCache(json);
		} catch (error) {}
		return new FSCache();
	}
}

// @ts-ignore
Set.prototype.toJSON = function () {
	return Array.from(this);
};

export class FSState extends Set<string> {
	static file = join(__dirname, "..", "state.json");

	constructor(entries?: Iterable<string>) {
		super(entries);
	}

	save() {
		writeFileSync(FSState.file, JSON.stringify(this));
	}

	static load() {
		try {
			const data = readFileSync(FSState.file, { encoding: "utf8" });
			const json = JSON.parse(data);
			return new FSState(json);
		} catch (error) {}
		return new FSState();
	}

	async getSize() {
		return this.size;
	}
}
