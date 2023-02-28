import workerpool from "workerpool";
import { client } from "./storage/redis";

async function main() {
	const threads = 100;

	const pool = workerpool.pool(__dirname + "/../dist/worker.js", {
		minWorkers: threads,
		maxWorkers: threads,
	});

	await client.connect();
	var installing = 0;
	var finished = 0;

	var pkgs = await client.zRangeWithScores("pkg", "-inf", "+inf", {
		BY: "SCORE",
	});

	const alreadyFetched = await client.smIsMember(
		"state",
		pkgs.map((x) => x.value)
	);
	const previous = pkgs.length;
	pkgs = pkgs.filter((_, i) => !alreadyFetched[i]);
	console.log("Already fetched", previous - pkgs.length, "packages");

	function onTaskFinish(pkg: string) {
		console.log(finished++, "Finished  ", pkg);
		doTask();
	}

	function doTask() {
		const pkg = pkgs.pop()?.value;
		if (!pkg) return;

		console.log(installing++, "Installing", pkg);
		const onFinish = onTaskFinish.bind(null, pkg);

		return pool
			.exec("extractNamesNPM", [pkg])
			.timeout(1000 * 60)
			.then(onFinish)
			.catch(onFinish);
	}

	for (let i = 0; i < threads; i++) {
		doTask();
		await sleep(100);
	}
}

export function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

if (workerpool.isMainThread) main();

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);
