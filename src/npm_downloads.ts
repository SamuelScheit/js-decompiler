import fetch from "cross-fetch";
import workerpool from "workerpool";
import { client } from "./storage/redis";

var pkgs: string[] = require("../pkgs.json");

async function request(body: string[]) {
	try {
		const response = await fetch(`https://api.npmjs.org/downloads/point/last-week/${body.join(",")}`);
		var data = await response.json();
		if (body.length === 1) {
			data = { [body[0]]: data };
		}

		const members = Object.values(data)
			.filter((x: any) => x && typeof x.downloads === "number" && x.package)
			.map((x: any) => ({ score: x.downloads, value: x.package }));

		if (!members.length) {
			console.log(data, body);
			return;
		}
		// console.log(data);

		await client.zAdd("pkg", members);
	} catch (error) {
		console.error(error);
	}
}

client.connect();

async function main() {
	const pool = workerpool.pool(__filename, {
		maxWorkers: 10
	});

	setInterval(()=>{
		console.log(pool.stats().pendingTasks)
	}, 1000)

	const step = 128;
	let i = 0;
	const previous = pkgs.length;

	var exists = new Set(await client.zRange("pkg", -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER));
	pkgs = pkgs.filter((x, i) => !exists.has(x));
	console.log("Already fetched", previous - pkgs.length, "packages");
	console.log("missing", pkgs.length, "packages");

	while (pkgs.length) {
		const body = pkgs.splice(0, step);
		const bulk = [] as string[];

		for (const pkg of body) {
			if (pkg.includes("@")) {
				pool.exec("request", [[pkg]]);
				console.log(i++, 1);
			} else {
				bulk.push(pkg);
			}
		}

		if (!bulk.length) continue;
		console.log(i++, bulk.length);

		pool.exec("request", [bulk]);
	}
}

if (workerpool.isMainThread) main();
else {
	workerpool.worker({
		request,
	});
}

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
