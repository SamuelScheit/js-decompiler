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
