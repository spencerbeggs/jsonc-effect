/**
 * JSONC error types using Effect's Data.TaggedError pattern.
 *
 * @packageDocumentation
 */

import { Data, Schema } from "effect";
import type { JsoncParseOptions } from "./schemas.js";

/**
 * Error codes representing specific JSONC parse failures.
 *
 * @remarks
 * Each code maps to a distinct syntactic error the parser can encounter,
 * from invalid symbols and number formats to missing delimiters and
 * unexpected end-of-input conditions.
 *
 * @see {@link JsoncParseErrorDetail} — carries one of these codes alongside
 *   position information
 *
 * @public
 */
export const JsoncParseErrorCode = Schema.Literal(
	"InvalidSymbol",
	"InvalidNumberFormat",
	"PropertyNameExpected",
	"ValueExpected",
	"ColonExpected",
	"CommaExpected",
	"CloseBraceExpected",
	"CloseBracketExpected",
	"EndOfFileExpected",
	"InvalidCommentToken",
	"UnexpectedEndOfComment",
	"UnexpectedEndOfString",
	"UnexpectedEndOfNumber",
	"InvalidUnicode",
	"InvalidEscapeCharacter",
	"InvalidCharacter",
);
/**
 * The union of all JSONC parse error code string literals.
 *
 * @see {@link JsoncParseErrorCode}
 *
 * @public
 */
export type JsoncParseErrorCode = Schema.Schema.Type<typeof JsoncParseErrorCode>;

/**
 * Detail for a single parse error, including the error code, a human-readable
 * message, and the exact position within the source document.
 *
 * @remarks
 * - `code` — a {@link JsoncParseErrorCode} identifying the error kind.
 * - `message` — a descriptive message suitable for display.
 * - `offset` — zero-based character offset where the error occurred.
 * - `length` — character length of the problematic span.
 * - `startLine` — zero-based line number of the error.
 * - `startCharacter` — zero-based column within `startLine`.
 *
 * @see {@link JsoncParseError} — aggregates an array of these details
 *
 * @example
 * ```ts
 * import { JsoncParseErrorDetail } from "jsonc-effect";
 *
 * const detail = new JsoncParseErrorDetail({
 *   code: "ValueExpected",
 *   message: "Value expected",
 *   offset: 5,
 *   length: 1,
 *   startLine: 0,
 *   startCharacter: 5,
 * });
 *
 * console.log(detail.code); // "ValueExpected"
 * console.log(detail.offset); // 5
 * ```
 *
 * @public
 */
export class JsoncParseErrorDetail extends Schema.Class<JsoncParseErrorDetail>("JsoncParseErrorDetail")({
	code: JsoncParseErrorCode,
	message: Schema.String,
	offset: Schema.Number,
	length: Schema.Number,
	startLine: Schema.Number,
	startCharacter: Schema.Number,
}) {}

/**
 * Base class for {@link JsoncParseError}.
 *
 * @privateRemarks
 * The `*Base` pattern is required because `Data.TaggedError` produces complex
 * type signatures involving intersection types and branded generics that
 * api-extractor cannot roll up into a single `.d.ts` bundle. By exporting
 * the base separately as `@internal`, the public `JsoncParseError` class
 * extends it with concrete fields, giving api-extractor a simple class
 * declaration to work with.
 *
 * @internal
 */
export const JsoncParseErrorBase = Data.TaggedError("JsoncParseError");

/**
 * Error raised when JSONC parsing encounters one or more syntax errors.
 *
 * @remarks
 * Contains the full source `text`, the `options` used for parsing, and an
 * `errors` array of {@link JsoncParseErrorDetail} instances with precise
 * position information for each problem found.
 *
 * @see {@link parse} — may fail with this error
 * @see {@link parseTree} — may fail with this error
 *
 * @example Catching with `Effect.catchTag`
 * ```ts
 * import { Effect } from "effect";
 * import { parse } from "jsonc-effect";
 *
 * const program = parse("{ invalid }").pipe(
 *   Effect.catchTag("JsoncParseError", (e) => {
 *     console.error(e.errors); // Array of JsoncParseErrorDetail
 *     return Effect.succeed({});
 *   }),
 * );
 * ```
 *
 * @example Inspecting error details
 * ```ts
 * import { Effect } from "effect";
 * import { parse } from "jsonc-effect";
 *
 * const program = parse("{ invalid }").pipe(
 *   Effect.catchTag("JsoncParseError", (e) => {
 *     for (const detail of e.errors) {
 *       console.error(
 *         `[${detail.code}] ${detail.message} at line ${detail.startLine}:${detail.startCharacter}`,
 *       );
 *     }
 *     return Effect.succeed({});
 *   }),
 * );
 * ```
 *
 * @public
 */
export class JsoncParseError extends JsoncParseErrorBase<{
	readonly errors: ReadonlyArray<JsoncParseErrorDetail>;
	readonly text: string;
	readonly options?: Partial<JsoncParseOptions>;
}> {
	get message(): string {
		const count = this.errors.length;
		return `JSONC parse failed with ${count} error${count !== 1 ? "s" : ""}: ${this.errors.map((e) => e.message).join("; ")}`;
	}
}

/**
 * Base class for {@link JsoncNodeNotFoundError}.
 *
 * @privateRemarks
 * Uses the same `*Base` pattern as {@link JsoncParseErrorBase} to work
 * around api-extractor's inability to roll up the complex type produced
 * by `Data.TaggedError` into a single `.d.ts` declaration.
 *
 * @internal
 */
export const JsoncNodeNotFoundErrorBase = Data.TaggedError("JsoncNodeNotFoundError");

/**
 * Error raised when AST navigation fails to find a node at the given path.
 *
 * @remarks
 * Contains the `path` that was searched and the `rootNodeType` of the tree
 * that was traversed.
 *
 * @see {@link findNode} — may fail with this error
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { parseTree, findNode } from "jsonc-effect";
 *
 * const program = parseTree('{ "a": 1 }').pipe(
 *   Effect.flatMap((root) => findNode(root, ["missing", "path"])),
 *   Effect.catchTag("JsoncNodeNotFoundError", (e) => {
 *     console.error(`Not found: [${e.path.join(", ")}] in ${e.rootNodeType}`);
 *     return Effect.succeed(undefined);
 *   }),
 * );
 * ```
 *
 * @public
 */
export class JsoncNodeNotFoundError extends JsoncNodeNotFoundErrorBase<{
	readonly path: ReadonlyArray<string | number>;
	readonly rootNodeType: string;
}> {
	get message(): string {
		return `Node not found at path [${this.path.join(", ")}] in ${this.rootNodeType} node`;
	}
}

/**
 * Base class for {@link JsoncModificationError}.
 *
 * @privateRemarks
 * Uses the same `*Base` pattern as {@link JsoncParseErrorBase} to work
 * around api-extractor's inability to roll up the complex type produced
 * by `Data.TaggedError` into a single `.d.ts` declaration.
 *
 * @internal
 */
export const JsoncModificationErrorBase = Data.TaggedError("JsoncModificationError");

/**
 * Error raised when {@link modify} produces invalid edits or encounters
 * an unsupported modification scenario.
 *
 * @remarks
 * Contains the `path` where modification was attempted and a `reason`
 * string explaining why it failed.
 *
 * @see {@link modify} — may fail with this error
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { modify } from "jsonc-effect";
 *
 * const program = modify("{}", ["deep", "path"], 42).pipe(
 *   Effect.catchTag("JsoncModificationError", (e) => {
 *     console.error(`Failed at [${e.path.join(", ")}]: ${e.reason}`);
 *     return Effect.succeed([]);
 *   }),
 * );
 * ```
 *
 * @public
 */
export class JsoncModificationError extends JsoncModificationErrorBase<{
	readonly path: ReadonlyArray<string | number>;
	readonly reason: string;
}> {
	get message(): string {
		return `Modification failed at path [${this.path.join(", ")}]: ${this.reason}`;
	}
}

/**
 * Union of all JSONC error types, useful for exhaustive error handling
 * with `Effect.catchTags`.
 *
 * @see {@link JsoncParseError}
 * @see {@link JsoncNodeNotFoundError}
 * @see {@link JsoncModificationError}
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import type { JsoncError } from "jsonc-effect";
 * import { parse, parseTree, findNode, modify } from "jsonc-effect";
 *
 * const program = parse("{}").pipe(
 *   Effect.catchTags({
 *     JsoncParseError: (e) => Effect.succeed("parse failed"),
 *     JsoncModificationError: (e) => Effect.succeed("modify failed"),
 *     JsoncNodeNotFoundError: (e) => Effect.succeed("node not found"),
 *   }),
 * );
 * ```
 *
 * @public
 */
export type JsoncError = JsoncParseError | JsoncNodeNotFoundError | JsoncModificationError;
