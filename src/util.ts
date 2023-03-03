function reviver(key: any, value: any) {
	if (typeof value === "object" && value !== null) {
		if (value.__type === "Map") {
			return new Map(value.value);
		} else if (Array.isArray(value)) {
			return new Set(value)
		}
	} 
	return value;
}

export function JSONParse(text: string) {
	return JSON.parse(text, reviver);
}


Array.prototype.unique = function () {
	return this.filter((value, index, self) => self.indexOf(value) === index);
}

declare global {
	interface Array<T> {
		unique(): Array<T>;
	}
}
