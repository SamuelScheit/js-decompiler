async function main() {
	var i, result, add;

	function step0() {
		console.log("test");
		i = 0;
		step1();
	}

	function step1() {
		if (!(i < 10)) return step4();
		return [4 /*yield*/, main()];
	}

	function step2() {
		_a.sent(); // yield
		_a.label = 3;
	}

	function step3() {
		i++;
		return step1();
	}

	function step4() {
		if (!true) step6()
		return main()
	}

	function step5() {
		_a.sent();
		return step6()
	}

	function step6() {
		_a.sent();
		return main()
	}

	function step7() {
		result = _a.sent();
		add = result + 1;
		return
	}

	step0()

	return __generator(this, function (_a) {
		switch (_a.label) {
			case 0:
				console.log("test");
				i = 0;
				_a.label = 1;
			case 1:
				if (!(i < 10)) return [3 /*break*/, 4];
				return [4 /*yield*/, main()];
			case 2:
				_a.sent(); // yield
				_a.label = 3;
			case 3:
				i++;
				return [3 /*break*/, 1];
			case 4:
				if (!true) return [3 /*break*/, 6];
				return [4 /*yield*/, main()];
			case 5:
				_a.sent();
				return [3 /*break*/, 6];
			case 6:
				return [4 /*yield*/, main()];
			case 7:
				result = _a.sent();
				add = result + 1;
				return [2 /*return*/];
		}
	});
}
