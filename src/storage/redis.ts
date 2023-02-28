import { createClient } from "redis";

export const client = createClient();

export class RedisCache {
	static key = "cache";
	constructor() {}

	getMultiple(args: string[]) {
		return client.hmGet(RedisCache.key, args);
	}

	get(args: string) {
		return client.hGet(RedisCache.key, args);
	}

	async add(value: any, pkg: string) {
		const exists = await this.get(value);
		if (exists) {
			if (exists.includes(pkg)) return;
			pkg += "," + exists;
		}
		await client.hSet(RedisCache.key, value, pkg);
	}

	save() {}
}

export class RedisState {
	static key = "state";
	constructor() {}

	has(value: string) {
		return client.sIsMember(RedisState.key, value);
	}

	add(value: string) {
		return client.SADD(RedisState.key, value);
	}

	getSize() {
		return client.SCARD(RedisState.key);
	}

	save() {}
}
