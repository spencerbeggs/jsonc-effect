/**
 * JSONC Schema definitions for tokens, AST nodes, and options.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";

/**
 * Token types produced by the JSONC scanner.
 * Uses string literals instead of numeric enums for self-documenting debug output.
 */
export const JsoncSyntaxKind = Schema.Literal(
	"OpenBrace",
	"CloseBrace",
	"OpenBracket",
	"CloseBracket",
	"Comma",
	"Colon",
	"Null",
	"True",
	"False",
	"String",
	"Number",
	"LineComment",
	"BlockComment",
	"LineBreak",
	"Trivia",
	"Unknown",
	"EOF",
);
export type JsoncSyntaxKind = Schema.Schema.Type<typeof JsoncSyntaxKind>;

/**
 * Scan error codes produced by the scanner.
 */
export const JsoncScanError = Schema.Literal(
	"None",
	"UnexpectedEndOfComment",
	"UnexpectedEndOfString",
	"UnexpectedEndOfNumber",
	"InvalidUnicode",
	"InvalidEscapeCharacter",
	"InvalidCharacter",
	"InvalidSymbol",
);
export type JsoncScanError = Schema.Schema.Type<typeof JsoncScanError>;

/**
 * A single token produced by the JSONC scanner.
 */
export class JsoncToken extends Schema.Class<JsoncToken>("JsoncToken")({
	kind: JsoncSyntaxKind,
	value: Schema.String,
	offset: Schema.Number,
	length: Schema.Number,
	startLine: Schema.Number,
	startCharacter: Schema.Number,
	error: JsoncScanError,
}) {}

/**
 * AST node types.
 */
export const JsoncNodeType = Schema.Literal("object", "array", "property", "string", "number", "boolean", "null");
export type JsoncNodeType = Schema.Schema.Type<typeof JsoncNodeType>;

/**
 * AST node representing a parsed JSONC element.
 * Parent field is intentionally omitted to avoid circular references.
 */
export class JsoncNode extends Schema.Class<JsoncNode>("JsoncNode")({
	type: JsoncNodeType,
	value: Schema.optional(Schema.Unknown),
	offset: Schema.Number,
	length: Schema.Number,
	colonOffset: Schema.optional(Schema.Number),
	children: Schema.optional(Schema.Array(Schema.suspend((): Schema.Schema<JsoncNode> => JsoncNode))),
}) {}

/**
 * A path segment: string for object keys, number for array indices.
 */
export const JsoncSegment = Schema.Union(Schema.String, Schema.Number);
export type JsoncSegment = Schema.Schema.Type<typeof JsoncSegment>;

/**
 * A path to a location in a JSONC document.
 */
export const JsoncPath = Schema.Array(JsoncSegment);
export type JsoncPath = Schema.Schema.Type<typeof JsoncPath>;

/**
 * A text edit to apply to a JSONC document.
 */
export class JsoncEdit extends Schema.Class<JsoncEdit>("JsoncEdit")({
	offset: Schema.Number,
	length: Schema.Number,
	content: Schema.String,
}) {}

/**
 * A range within a JSONC document.
 */
export class JsoncRange extends Schema.Class<JsoncRange>("JsoncRange")({
	offset: Schema.Number,
	length: Schema.Number,
}) {}

/**
 * Options controlling JSONC parse behavior.
 */
export class JsoncParseOptions extends Schema.Class<JsoncParseOptions>("JsoncParseOptions")({
	disallowComments: Schema.optionalWith(Schema.Boolean, {
		default: () => false,
	}),
	allowTrailingComma: Schema.optionalWith(Schema.Boolean, {
		default: () => true,
	}),
	allowEmptyContent: Schema.optionalWith(Schema.Boolean, {
		default: () => false,
	}),
}) {}

/**
 * Options controlling JSONC formatting behavior.
 */
export class JsoncFormattingOptions extends Schema.Class<JsoncFormattingOptions>("JsoncFormattingOptions")({
	tabSize: Schema.optionalWith(Schema.Number, { default: () => 2 }),
	insertSpaces: Schema.optionalWith(Schema.Boolean, { default: () => true }),
	eol: Schema.optionalWith(Schema.String, { default: () => "\n" }),
	insertFinalNewline: Schema.optionalWith(Schema.Boolean, {
		default: () => false,
	}),
	keepLines: Schema.optionalWith(Schema.Boolean, { default: () => false }),
}) {}
