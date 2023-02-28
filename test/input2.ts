// @ts-nocheck
// import React, { useEffect } from "react";

async function main() {
	console.log("test");
	for (let i = 0; i < 10; i++) {
		await main(0);
		if (1) {
			await main(1);
		} else if (2) {
			await main(2);
		} else {
			await main(3);
		}
	}
}

export { main };
