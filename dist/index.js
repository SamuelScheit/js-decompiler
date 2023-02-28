"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = void 0;
const workerpool_1 = __importDefault(require("workerpool"));
const redis_1 = require("./storage/redis");
async function main() {
    const threads = 100;
    const pool = workerpool_1.default.pool(__dirname + "/../dist/worker.js", {
        minWorkers: threads,
        maxWorkers: threads,
    });
    await redis_1.client.connect();
    var installing = 0;
    var finished = 0;
    var pkgs = await redis_1.client.zRangeWithScores("pkg", "-inf", "+inf", {
        BY: "SCORE",
    });
    const alreadyFetched = await redis_1.client.smIsMember("state", pkgs.map((x) => x.value));
    const previous = pkgs.length;
    pkgs = pkgs.filter((_, i) => !alreadyFetched[i]);
    console.log("Already fetched", previous - pkgs.length, "packages");
    function onTaskFinish(pkg) {
        console.log(finished++, "Finished  ", pkg);
        doTask();
    }
    function doTask() {
        const pkg = pkgs.pop()?.value;
        if (!pkg)
            return;
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
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
exports.sleep = sleep;
if (workerpool_1.default.isMainThread)
    main();
process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);
