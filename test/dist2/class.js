"use strict";
var __extends = (this && this.__extends) ||
    (function () {
        var extendStatics = function (d, b) {
            extendStatics =
                Object.setPrototypeOf ||
                    ({ __proto__: [] } instanceof Array &&
                        function (d, b) {
                            d.__proto__ = b;
                        }) ||
                    function (d, b) {
                        for (var p in b)
                            if (Object.prototype.hasOwnProperty.call(b, p))
                                d[p] = b[p];
                    };
            return extendStatics(d, b);
        };
        return function (d, b) {
            if (typeof b !== "function" && b !== null)
                throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
            extendStatics(d, b);
            function __() {
                this.constructor = d;
            }
            d.prototype = b === null ? Object.create(b) : ((__.prototype = b.prototype), new __());
        };
    })();
Object.defineProperty(exports, "__esModule", { value: true });
exports.B = exports.A = void 0;
// @ts-nocheck
var A = /** @class */ (function () {
    function A() {
        console.log("hello");
    }
    Object.defineProperty(A.prototype, "getter", {
        get: function () {
            return 0;
        },
        enumerable: false,
        configurable: true,
    });
    Object.defineProperty(A.prototype, "setter", {
        set: function (value) {
            this.val = value;
        },
        enumerable: false,
        configurable: true,
    });
    return A;
})();
exports.A = A;
var B = /** @class */ (function (_super) {
    __extends(B, _super);
    function B() {
        var _this = _super.call(this) || this;
        console.log("hello");
        return _this;
    }
    return B;
})(A);
exports.B = B;
