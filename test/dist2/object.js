"use strict";
var __assign = (this && this.__assign) ||
    function () {
        __assign =
            Object.assign ||
                function (t) {
                    for (var s, i = 1, n = arguments.length; i < n; i++) {
                        s = arguments[i];
                        for (var p in s)
                            if (Object.prototype.hasOwnProperty.call(s, p))
                                t[p] = s[p];
                    }
                    return t;
                };
        return __assign.apply(this, arguments);
    };
var test = {
    foo: 1 !== null && 1 !== void 0 ? 1 : 2,
};
test === null || test === void 0 ? void 0 : test.foo;
var x = __assign(__assign({}, test), { foo: 2 });
void 0;
