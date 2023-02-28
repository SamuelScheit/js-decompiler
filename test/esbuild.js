"use strict";
(() => {
	var r = Object.defineProperty;
	var f = Object.getOwnPropertyDescriptor;
	var m = Object.getOwnPropertyNames;
	var p = Object.prototype.hasOwnProperty;
	var q = (i, a) => () => (i && (a = i((i = 0))), a);
	var s = (i, a) => {
			for (var e in a) r(i, e, { get: a[e], enumerable: !0 });
		},
		w = (i, a, e, t) => {
			if ((a && typeof a == "object") || typeof a == "function") for (let n of m(a)) !p.call(i, n) && n !== e && r(i, n, { get: () => a[n], enumerable: !(t = f(a, n)) || t.enumerable });
			return i;
		};
	var x = (i) => w(r({}, "__esModule", { value: !0 }), i);
	var o = {};
	s(o, { main: () => c });
	async function c() {
		await c();
	}
	var u = q(() => {
		"use strict";
	});
	u();
})();
