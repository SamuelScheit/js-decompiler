// @ts-nocheck
export class A {
	constructor() {
		console.log("hello");
	}

	get getter() {
		return 0;
	}

	set setter(value) {
		this.val = value;
	}
}

export class B extends A {
	constructor() {
		super();
		console.log("hello");
	}
}
