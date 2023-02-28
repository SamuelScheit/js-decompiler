var x = { test: "hi" };
var i = 0;
i++;
var l = x?.test || i;

if (x) {
	console.log(x.test);
}

var t = {
	x,
	test() {
		console.log(this.x.test);
	},
	l,
};

undefined;

void 0;

null == t ? void 0 : t.test;
null == t ? x : t;

(0, t.test)();

const x = function () {
	console.log(x.test);
	const y = function() {
		this.x.test;
	}
};

function test() {
	console.log("test");
}

