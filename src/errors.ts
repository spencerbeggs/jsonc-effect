/**
 * JSONC error types using Effect's Data.TaggedError pattern.
 *
 * @packageDocumentation
 */

import { Data, Schema } from "effect";

/**
 * Error codes for JSONC parse errors.
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
export type JsoncParseErrorCode = Schema.Schema.Type<typeof JsoncParseErrorCode>;

/**
 * Detail for a single parse error with location information.
 */
export class JsoncParseErrorDetail extends Schema.Class<JsoncParseErrorDetail>("JsoncParseErrorDetail")({
	code: JsoncParseErrorCode,
	message: Schema.String,
	offset: Schema.Number,
	length: Schema.Number,
	startLine: Schema.Number,
	startCharacter: Schema.Number,
}) {}

/** @internal */
export const JsoncParseErrorBase = Data.TaggedError("JsoncParseError");

/**
 * Error raised when JSONC parsing encounters syntax errors.
 * Contains an array of error details with position information.
 */
export class JsoncParseError extends JsoncParseErrorBase<{
	readonly errors: ReadonlyArray<JsoncParseErrorDetail>;
	readonly text: string;
	readonly options?: unknown;
}> {
	get message(): string {
		const count = this.errors.length;
		return `JSONC parse failed with ${count} error${count !== 1 ? "s" : ""}: ${this.errors.map((e) => e.message).join("; ")}`;
	}
}

/** @internal */
export const JsoncNodeNotFoundErrorBase = Data.TaggedError("JsoncNodeNotFoundError");

/**
 * Error raised when AST navigation fails to find a node at the given path.
 */
export class JsoncNodeNotFoundError extends JsoncNodeNotFoundErrorBase<{
	readonly path: ReadonlyArray<string | number>;
	readonly rootNodeType: string;
}> {
	get message(): string {
		return `Node not found at path [${this.path.join(", ")}] in ${this.rootNodeType} node`;
	}
}

/** @internal */
export const JsoncModificationErrorBase = Data.TaggedError("JsoncModificationError");

/**
 * Error raised when modify() produces invalid edits.
 */
export class JsoncModificationError extends JsoncModificationErrorBase<{
	readonly path: ReadonlyArray<string | number>;
	readonly reason: string;
}> {
	get message(): string {
		return `Modification failed at path [${this.path.join(", ")}]: ${this.reason}`;
	}
}
