/**
 * JSONC Schema definitions for tokens, AST nodes, and options.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";

/**
 * Token types produced by the JSONC scanner.
 *
 * @remarks
 * Uses string literals instead of numeric enums so that token kinds are
 * self-documenting in debug output, log messages, and test assertions.
 * This avoids the "reverse-mapping" confusion of TypeScript numeric enums
 * and makes pattern-matching with `Schema.Literal` straightforward.
 *
 * @see {@link createScanner} — creates a scanner that emits these token types
 *
 * @public
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
/**
 * The union of all JSONC token kind string literals.
 *
 * @see {@link JsoncSyntaxKind}
 *
 * @public
 */
export type JsoncSyntaxKind = Schema.Schema.Type<typeof JsoncSyntaxKind>;

/**
 * Scanner error codes produced by the JSONC scanner.
 *
 * @remarks
 * `"None"` indicates a successful scan with no errors. All other values
 * describe a specific lexical error encountered while tokenizing input.
 *
 * @see {@link JsoncScanner} — the scanner interface that reports these errors
 *
 * @public
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
/**
 * The union of all JSONC scan error string literals.
 *
 * @see {@link JsoncScanError}
 *
 * @public
 */
export type JsoncScanError = Schema.Schema.Type<typeof JsoncScanError>;

/**
 * A single token produced by the JSONC scanner, carrying its kind, textual
 * value, position within the source, and any scan error.
 *
 * @remarks
 * - `kind` — the {@link JsoncSyntaxKind} discriminator for this token.
 * - `value` — the raw text slice from the source document.
 * - `offset` — zero-based character offset from the start of the document.
 * - `length` — character length of this token in the source.
 * - `startLine` — zero-based line number where the token begins.
 * - `startCharacter` — zero-based column within `startLine`.
 * - `error` — a {@link JsoncScanError} code; `"None"` when the token is valid.
 *
 * @see {@link createScanner} — produces a stream of `JsoncToken` instances
 *
 * @example
 * ```ts
 * import { JsoncToken } from "jsonc-effect";
 *
 * const token = new JsoncToken({
 *   kind: "String",
 *   value: '"hello"',
 *   offset: 0,
 *   length: 7,
 *   startLine: 0,
 *   startCharacter: 0,
 *   error: "None",
 * });
 *
 * console.log(token.kind); // "String"
 * console.log(token.value); // '"hello"'
 * ```
 *
 * @privateRemarks
 * `Schema.Class` gives `JsoncToken` structural equality via `Data.Class`
 * under the hood, so two tokens with identical fields are considered equal
 * by `Equal.equals`. This is essential for test assertions and Effect's
 * structural comparison semantics.
 *
 * @public
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
 * Discriminator values for JSONC AST node types.
 *
 * @remarks
 * These correspond to the JSON value types (`"string"`, `"number"`,
 * `"boolean"`, `"null"`) plus structural types (`"object"`, `"array"`)
 * and the special `"property"` type representing a key-value pair inside
 * an object.
 *
 * @see {@link JsoncNode} — the AST node that carries this discriminator
 *
 * @public
 */
export const JsoncNodeType = Schema.Literal("object", "array", "property", "string", "number", "boolean", "null");
/**
 * The union of all JSONC AST node type string literals.
 *
 * @see {@link JsoncNodeType}
 *
 * @public
 */
export type JsoncNodeType = Schema.Schema.Type<typeof JsoncNodeType>;

/**
 * AST node representing a parsed JSONC element, produced by {@link parseTree}.
 *
 * @remarks
 * The `parent` field present in Microsoft's `jsonc-parser` is intentionally
 * omitted here to avoid circular references, which would break structural
 * equality, serialization, and Effect's `Schema.encode`/`Schema.decode`
 * pipelines. Child relationships are expressed via the `children` array,
 * and the recursive type is handled with `Schema.suspend`.
 *
 * - `type` — the {@link JsoncNodeType} discriminator.
 * - `value` — the decoded JavaScript value for leaf nodes (`string`,
 *   `number`, `boolean`, `null`); `undefined` for structural nodes.
 * - `offset` — zero-based character offset of this node in the source.
 * - `length` — character length of this node in the source.
 * - `colonOffset` — for `"property"` nodes, the offset of the `:` separator.
 * - `children` — child nodes; present for `"object"`, `"array"`, and
 *   `"property"` nodes.
 *
 * @see {@link parseTree} — produces the root `JsoncNode`
 * @see {@link findNode} — locates a descendant by path
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { parseTree } from "jsonc-effect";
 *
 * const program = parseTree('{ "key": [1, 2] }').pipe(
 *   Effect.map((root) => {
 *     // root.type === "object"
 *     const property = root.children?.[0]; // "property" node
 *     const array = property?.children?.[1]; // "array" node
 *     console.log(array?.children?.length); // 2
 *   }),
 * );
 * ```
 *
 * @privateRemarks
 * Unlike the `*Base` pattern needed for `Data.TaggedError` subclasses,
 * `Schema.Class` works directly for data types — api-extractor can roll up
 * the generated `.d.ts` without issues. The `Schema.suspend` call for
 * `children` is required to break the circular type reference at the schema
 * level while still allowing recursive decode/encode.
 *
 * @public
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
 * A single segment of a {@link JsoncPath}: a `string` for object property
 * keys or a `number` for array indices.
 *
 * @see {@link findNode} — resolves a path to an AST node
 * @see {@link modify} — applies a value change at a path
 *
 * @example
 * ```ts
 * import type { JsoncSegment } from "jsonc-effect";
 *
 * const objectKey: JsoncSegment = "compilerOptions";
 * const arrayIndex: JsoncSegment = 0;
 * ```
 *
 * @public
 */
export const JsoncSegment = Schema.Union(Schema.String, Schema.Number);
/**
 * A single path segment type — `string | number`.
 *
 * @see {@link JsoncSegment}
 *
 * @public
 */
export type JsoncSegment = Schema.Schema.Type<typeof JsoncSegment>;

/**
 * An ordered sequence of {@link JsoncSegment} values describing a location
 * within a JSONC document tree.
 *
 * @see {@link findNode} — resolves a `JsoncPath` to an AST node
 * @see {@link modify} — applies a modification at a `JsoncPath`
 *
 * @example
 * ```ts
 * import type { JsoncPath } from "jsonc-effect";
 *
 * // Path to the "strict" property inside "compilerOptions"
 * const path: JsoncPath = ["compilerOptions", "strict"];
 *
 * // Path to the second element of the "include" array
 * const arrayPath: JsoncPath = ["include", 1];
 * ```
 *
 * @public
 */
export const JsoncPath = Schema.Array(JsoncSegment);
/**
 * An array of path segments — `ReadonlyArray<string | number>`.
 *
 * @see {@link JsoncPath}
 *
 * @public
 */
export type JsoncPath = Schema.Schema.Type<typeof JsoncPath>;

/**
 * A non-mutating text edit describing a replacement within a JSONC document.
 *
 * @remarks
 * Edits use zero-based `offset` and `length` to identify the span of text
 * to replace, and `content` for the replacement string. To insert without
 * removing text, set `length` to `0`. To delete without inserting, set
 * `content` to `""`.
 *
 * Edits returned by {@link format} and {@link modify} should be applied
 * via {@link applyEdits}, which processes them in reverse order so that
 * earlier offsets remain valid.
 *
 * @see {@link format} — produces edits for formatting
 * @see {@link modify} — produces edits for value changes
 * @see {@link applyEdits} — applies an array of edits to a source string
 *
 * @example
 * ```ts
 * import { JsoncEdit } from "jsonc-effect";
 *
 * // An edit that inserts ", true" at offset 10
 * const edit = new JsoncEdit({ offset: 10, length: 0, content: ", true" });
 *
 * console.log(edit.offset); // 10
 * console.log(edit.length); // 0
 * console.log(edit.content); // ", true"
 * ```
 *
 * @public
 */
export class JsoncEdit extends Schema.Class<JsoncEdit>("JsoncEdit")({
	offset: Schema.Number,
	length: Schema.Number,
	content: Schema.String,
}) {}

/**
 * A range within a JSONC document, expressed as a zero-based character
 * offset and a length in characters.
 *
 * @remarks
 * Both `offset` and `length` are measured in UTF-16 code units (JavaScript
 * string indices). Pass a `JsoncRange` to {@link format} to restrict
 * formatting to a specific region of the document rather than the whole file.
 *
 * @see {@link format} — accepts an optional `JsoncRange` parameter
 *
 * @public
 */
export class JsoncRange extends Schema.Class<JsoncRange>("JsoncRange")({
	offset: Schema.Number,
	length: Schema.Number,
}) {}

/**
 * Options controlling JSONC parse behavior.
 *
 * @remarks
 * - `disallowComments` — when `true`, line and block comments are treated
 *   as parse errors. Defaults to `false`.
 * - `allowTrailingComma` — when `true`, trailing commas after the last
 *   element in arrays and objects are permitted. Defaults to `true`, which
 *   differs from Microsoft's `jsonc-parser` (where the default is `false`).
 * - `allowEmptyContent` — when `true`, an empty string parses as
 *   `undefined` rather than producing an error. Defaults to `false`.
 *
 * @see {@link parse} — parses JSONC text into a JavaScript value
 * @see {@link parseTree} — parses JSONC text into an AST
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { parse, JsoncParseOptions } from "jsonc-effect";
 *
 * const options = new JsoncParseOptions({
 *   disallowComments: true,
 *   allowTrailingComma: false,
 * });
 *
 * const program = parse('{ "key": "value" }', options).pipe(
 *   Effect.map((value) => console.log(value)),
 * );
 * ```
 *
 * @public
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
 *
 * @remarks
 * - `tabSize` — number of spaces per indentation level. Defaults to `2`.
 * - `insertSpaces` — when `true`, use spaces for indentation; when `false`,
 *   use tab characters. Defaults to `true`.
 * - `eol` — the end-of-line sequence. Defaults to `"\n"`.
 * - `insertFinalNewline` — when `true`, ensure the formatted output ends
 *   with a newline. Defaults to `false`.
 * - `keepLines` — when `true`, preserve existing line breaks in the source
 *   rather than reflowing. Defaults to `false`.
 *
 * @see {@link format} — uses these options to produce formatting edits
 * @see {@link formatAndApply} — formats and applies edits in one step
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { formatAndApply, JsoncFormattingOptions } from "jsonc-effect";
 *
 * const options = new JsoncFormattingOptions({
 *   tabSize: 4,
 *   insertSpaces: true,
 *   insertFinalNewline: true,
 * });
 *
 * const program = formatAndApply('{"key":"value"}', options).pipe(
 *   Effect.map((formatted) => console.log(formatted)),
 * );
 * ```
 *
 * @public
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
