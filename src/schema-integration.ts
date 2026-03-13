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
 * Pre-built `Schema<unknown, string>` that decodes a JSONC string into an
 * unknown JavaScript value using default parse options.
 *
 * This is the first stage of a typical parsing pipeline:
 *
 * ```
 * JSONC string  --JsoncFromString-->  unknown  --YourSchema-->  A
 * ```
 *
 * @remarks
 * Default parse options are used (comments allowed, trailing commas
 * allowed). The encode direction uses `JSON.stringify` with 2-space
 * indentation, which means comments present in the original JSONC
 * input are not preserved during a round-trip encode.
 *
 * For custom parse options, use {@link makeJsoncFromString} instead.
 *
 * @see {@link makeJsoncFromString} to create a schema with custom options.
 * @see {@link makeJsoncSchema} to compose JSONC parsing with a domain schema
 *   in one step.
 *
 * @example Decode a JSONC string
 * ```ts
 * import { Schema } from "effect";
 * import { JsoncFromString } from "jsonc-effect";
 *
 * const value: unknown = Schema.decodeUnknownSync(JsoncFromString)(
 *   '{ "key": 42 // comment\n}',
 * );
 * ```
 *
 * @example Compose with a domain schema
 * ```ts
 * import { Schema } from "effect";
 * import { JsoncFromString } from "jsonc-effect";
 *
 * const MyConfig = Schema.Struct({
 *   name: Schema.String,
 *   version: Schema.Number,
 * });
 *
 * const MyConfigFromJsonc = Schema.compose(JsoncFromString, MyConfig);
 * const config = Schema.decodeUnknownSync(MyConfigFromJsonc)(
 *   '{ "name": "app", "version": 1 }',
 * );
 * ```
 *
 * @public
 */
export const JsoncFromString: Schema.Schema<unknown, string> = makeJsoncFromString();

/**
 * Create a `Schema<unknown, string>` that decodes JSONC with custom
 * parse options.
 *
 * @param options - Partial {@link JsoncParseOptions} controlling comment
 *   handling and trailing-comma tolerance.
 * @returns A `Schema<unknown, string>` configured with the given options.
 *
 * @remarks
 * The encode direction uses `JSON.stringify` with 2-space indentation,
 * which produces standard JSON. Comments present in the original JSONC
 * input are not preserved during a round-trip encode.
 *
 * @see {@link JsoncFromString} for a zero-config default instance.
 * @see {@link makeJsoncSchema} to compose JSONC parsing with a domain
 *   schema in one step.
 *
 * @example Strict mode (no comments, no trailing commas)
 * ```ts
 * import { Schema } from "effect";
 * import { makeJsoncFromString } from "jsonc-effect";
 *
 * const StrictJsoncFromString = makeJsoncFromString({
 *   disallowComments: true,
 *   allowTrailingComma: false,
 * });
 *
 * const value: unknown = Schema.decodeUnknownSync(StrictJsoncFromString)(
 *   '{ "key": 42 }',
 * );
 * ```
 *
 * @privateRemarks
 * Internally delegates to `Schema.transformOrFail` to wire up the decode
 * and encode directions.
 *
 * @public
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
 * Create a composed `Schema<A, string>` that parses a JSONC string and
 * validates the result against a target domain schema in one step.
 *
 * @param targetSchema - The domain schema to validate the parsed value
 *   against. Its input type `I` must be assignable from `unknown`.
 * @param options - Optional partial {@link JsoncParseOptions} forwarded to
 *   the underlying JSONC parser.
 * @returns A `Schema<A, string>` that goes directly from a JSONC string
 *   to a fully validated domain value of type `A`.
 *
 * @remarks
 * Internally composes two schema stages:
 *
 * 1. JSONC string to `unknown` (via {@link makeJsoncFromString}).
 * 2. `unknown` to `A` (via the provided `targetSchema`).
 *
 * This avoids the need to manually call `Schema.compose`.
 *
 * @see {@link makeJsoncFromString} for the first stage of the pipeline.
 *
 * @example Typed configuration from JSONC
 * ```ts
 * import { Schema } from "effect";
 * import { makeJsoncSchema } from "jsonc-effect";
 *
 * const MyConfig = Schema.Struct({
 *   name: Schema.String,
 *   version: Schema.Number,
 * });
 *
 * const MyConfigFromJsonc = makeJsoncSchema(MyConfig);
 * const config = Schema.decodeUnknownSync(MyConfigFromJsonc)(
 *   '{ "name": "app", "version": 1 }',
 * );
 * ```
 *
 * @example With custom parse options
 * ```ts
 * import { Schema } from "effect";
 * import { makeJsoncSchema } from "jsonc-effect";
 *
 * const MyConfig = Schema.Struct({ debug: Schema.Boolean });
 *
 * const StrictConfig = makeJsoncSchema(MyConfig, {
 *   disallowComments: true,
 *   allowTrailingComma: false,
 * });
 *
 * const config = Schema.decodeUnknownSync(StrictConfig)(
 *   '{ "debug": true }',
 * );
 * ```
 *
 * @privateRemarks
 * Uses `Schema.compose` internally to chain the JSONC-from-string schema
 * with the provided target schema.
 *
 * @public
 */
export const makeJsoncSchema = <A, I>(
	targetSchema: Schema.Schema<A, I>,
	options?: Partial<JsoncParseOptions>,
): Schema.Schema<A, string> => Schema.compose(makeJsoncFromString(options), targetSchema as Schema.Schema<A, unknown>);
