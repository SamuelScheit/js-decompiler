// @ts-nocheck
async function main() {
	console.log("test");

	for (let i = 0; i < 10; i++) {
		await main(0);

		if (1) {
			await main(1);
		} else {
			await main(3);
		}

		try {
			await main("try");
		} catch (error) {
			await main("catch");
		}
	}
}
