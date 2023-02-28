import tar from "tar-stream";
import fetch from "cross-fetch";
import gunzip from "gunzip-maybe";

export async function extractTar(stream: ReadableStream, onFile: (name: string, code: string) => void) {
	const extract = tar.extract();
	// @ts-ignore
	stream.pipe(gunzip()).pipe(extract);

	return new Promise((resolve, reject) => {
		const results = [] as any[];
		extract
			.on("entry", function (header, stream, next) {
				const extension = header.name.split(".").pop()!;

				if (!["js", "mjs"].includes(extension) || header.type !== "file") {
					stream.resume();
					return next();
				}

				// console.log(header.type, header.name);
				const chunks = [] as Buffer[];

				stream
					.on("data", (chunk) => {
						chunks.push(chunk);
					})
					.on("end", async function () {
						const code = Buffer.concat(chunks).toString();
						results.push(await onFile(header.name, code));
						next(); // ready for next entry
					});
			})
			.on("finish", async function () {
				// all entries read
				resolve(await Promise.all(results));
			})
	});
}

export async function getNPMTarball(name: string, version?: string | null) {
	if (!version) {
		const response = await fetch(`https://registry.npmjs.org/${name}/latest`);
		const json = await response.json();
		if (!response.ok) throw json;
		version = json.version;
	}
	let pkg = name;
	if (name.startsWith("@")) pkg = name.split("/")[1];

	const response = await fetch(`https://registry.npmjs.org/${name}/-/${pkg}-${version}.tgz`);
	if (!response.ok) throw new Error("Failed to fetch tarball");

	return response.body!;
}

export async function extractNPM(name: string, version: string | undefined | null, onFile: (name: string, code: string) => void) {
	const response = await getNPMTarball(name, version);
	return await extractTar(response, onFile);
}

export async function fetchPackages(offset = 0) {
	const result = await fetch(`https://api.npms.io/v2/search?q=popularity-weight:100+not:deprecated,insecure&size=250&from=${offset}`);
	const json = await result.json();

	return json.results.map((x: any) => x.package.name) as string[]
}
