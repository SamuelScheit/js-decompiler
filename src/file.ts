import fs from "fs";
import path from "path";

export function copyRecursiveSync(src: string, dest: string) {
	var exists = fs.existsSync(src);
	if (!exists) return;
	var stats = fs.statSync(src);
	var isDirectory = exists && stats.isDirectory();
	if (isDirectory) {
		fs.mkdirSync(dest);
		fs.readdirSync(src).forEach(function (childItemName) {
			copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
		});
	} else {
		fs.copyFileSync(src, dest);
	}
}
