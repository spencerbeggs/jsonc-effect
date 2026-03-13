/**
 * Schema-based JSONC parsing pipelines.
 *
 * Transforms JSONC strings directly into typed domain objects
 * using Schema.transformOrFail and Schema.compose.
 *
 * @packageDocumentation
 */

import { Effect, ParseResult, Schema } from "effect";
import { parse } from "./parse.js";
import type { JsoncParseOptions } from "./schemas.js";

/**
 * Schema that transforms a JSONC string into an unknown JavaScript value.
 *
 * This is the first stage of a parsing pipeline:
 *   JSONC string → unknown → (your typed schema)
 *
 * @example
 * ```typescript
 * import { Schema } from "effect"
 * import { JsoncFromString } from "jsonc-effect"
 *
 * const MyConfigFromJsonc = Schema.compose(JsoncFromString, MyConfigSchema)
 * const config = Schema.decodeUnknownSync(MyConfigFromJsonc)(jsoncText)
 * ```
 */
export const JsoncFromString: Schema.Schema<unknown, string> = makeJsoncFromString();

/**
 * Create a JSONC-to-unknown Schema with custom parse options.
 *
 * @remarks
 * The encode direction uses `JSON.stringify` which produces standard
 * JSON. Comments present in the original JSONC input are not preserved
 * during round-trip encode/decode.
 *
 * @example
 * ```typescript
 * import { makeJsoncFromString } from "jsonc-effect"
 *
 * // Strict mode: no comments allowed
 * const StrictJsoncFromString = makeJsoncFromString({
 *   disallowComments: true,
 *   allowTrailingComma: false,
 * })
 * ```
 */
export function makeJsoncFromString(options?: Partial<JsoncParseOptions>): Schema.Schema<unknown, string> {
	return Schema.transformOrFail(Schema.String, Schema.Unknown, {
		strict: true,
		decode: (input, _options, ast) => {
			const program = options ? parse(input, options) : parse(input);
			return Effect.mapError(program, (parseError) => new ParseResult.Type(ast, input, parseError.message));
		},
		encode: (value) => ParseResult.succeed(JSON.stringify(value, null, 2)),
	}).annotations({
		title: "JsoncFromString",
		description: "Parse a JSONC string into an unknown JavaScript value",
	});
}

/**
 * Create a composed Schema that parses JSONC and validates against
 * a target schema in one step.
 *
 * @example
 * ```typescript
 * import { Schema } from "effect"
 * import { makeJsoncSchema } from "jsonc-effect"
 *
 * const MyConfig = Schema.Struct({
 *   name: Schema.String,
 *   version: Schema.Number,
 * })
 *
 * const MyConfigFromJsonc = makeJsoncSchema(MyConfig)
 * const config = Schema.decodeUnknownSync(MyConfigFromJsonc)(jsoncText)
 * ```
 */
export const makeJsoncSchema = <A, I>(
	targetSchema: Schema.Schema<A, I>,
	options?: Partial<JsoncParseOptions>,
): Schema.Schema<A, string> => Schema.compose(makeJsoncFromString(options), targetSchema as Schema.Schema<A, unknown>);
