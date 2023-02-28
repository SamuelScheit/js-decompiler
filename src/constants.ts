import { ParserPlugin } from "@babel/parser";

export const plugins = ["jsx", "flow", "decorators", "exportDefaultFrom"] as ParserPlugin[]

export const parseOptions = {
	strictMode: false,
	errorRecovery: true,
	plugins,
}
