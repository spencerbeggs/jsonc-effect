/**
 * JSONC equality comparisons — semantic equivalence for JSONC documents.
 *
 * Compares parsed values ignoring comments, whitespace, formatting,
 * and object key ordering.
 *
 * @packageDocumentation
 */

import { Effect, Function as Fn } from "effect";
import type { JsoncParseError } from "./errors.js";
import { parse } from "./parse.js";

/**
 * Deep-compare two plain JS values for structural equality (key-order independent for objects, order sensitive for arrays).
 *
 * @internal
 */
function deepEqual(a: unknown, b: unknown): boolean {
	// Identical references or equal primitives
	if (a === b) return true;

	// null check (typeof null === "object")
	if (a === null || b === null) return false;

	// Both must be the same type
	if (typeof a !== typeof b) return false;

	// Arrays
	if (Array.isArray(a)) {
		if (!Array.isArray(b)) return false;
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (!deepEqual(a[i], b[i])) return false;
		}
		return true;
	}
	if (Array.isArray(b)) return false;

	// Objects
	if (typeof a === "object" && typeof b === "object") {
		const aObj = a as Record<string, unknown>;
		const bObj = b as Record<string, unknown>;
		const aKeys = Object.keys(aObj);
		const bKeys = Object.keys(bObj);
		if (aKeys.length !== bKeys.length) return false;
		for (const key of aKeys) {
			if (!Object.hasOwn(bObj, key)) return false;
			if (!deepEqual(aObj[key], bObj[key])) return false;
		}
		return true;
	}

	return false;
}

/**
 * Compare two JSONC strings for semantic equality.
 *
 * Supports {@link https://effect.website/docs/effect/function#dual | Function.dual}
 * for both data-first and data-last (pipeline) usage.
 *
 * @param self - The first JSONC string.
 * @param that - The second JSONC string.
 *
 * @returns `Effect<boolean, JsoncParseError>` — `true` when both strings parse to
 *   semantically equivalent values, `false` otherwise. Fails with
 *   {@link JsoncParseError} if either string is malformed.
 *
 * @remarks
 * Both strings are parsed via {@link parse} and then deep-compared. The comparison
 * ignores comments, whitespace, formatting, and object key ordering. Array order
 * IS significant. Uses `Effect.all` internally, so the effect fails on the first
 * parse error encountered.
 *
 * @see {@link equalsValue} — compare a JSONC string against an existing JS value
 * @see {@link parse} — the underlying parser used for both strings
 *
 * @example Data-first comparison
 * ```ts
 * import { Effect } from "effect";
 * import { equals } from "jsonc-effect";
 *
 * const result = Effect.runSync(
 *   equals('{ "a": 1, "b": 2 }', '{"b":2,"a":1}')
 * );
 * // result is true
 * ```
 *
 * @example Key-order independence
 * ```ts
 * import { Effect } from "effect";
 * import { equals } from "jsonc-effect";
 *
 * // Object key order does not matter
 * const sameKeys = Effect.runSync(
 *   equals('{"z":1,"a":2}', '{"a":2,"z":1}')
 * );
 * // sameKeys is true
 *
 * // Array order DOES matter
 * const differentOrder = Effect.runSync(
 *   equals('[1, 2]', '[2, 1]')
 * );
 * // differentOrder is false
 * ```
 *
 * @example Error handling
 * ```ts
 * import { Effect, Either } from "effect";
 * import type { JsoncParseError } from "jsonc-effect";
 * import { equals } from "jsonc-effect";
 *
 * const result: Either.Either<boolean, JsoncParseError> = Effect.runSync(
 *   Effect.either(equals('{ invalid }', '{}'))
 * );
 * // result is Either.left(JsoncParseError)
 * ```
 *
 * @privateRemarks
 * Uses a simple recursive `deepEqual` helper rather than Effect's `Equal` module
 * because the parsed values are plain JS objects and arrays, not Effect data types.
 *
 * @public
 */
export const equals: {
	(that: string): (self: string) => Effect.Effect<boolean, JsoncParseError>;
	(self: string, that: string): Effect.Effect<boolean, JsoncParseError>;
} = Fn.dual(
	2,
	(self: string, that: string): Effect.Effect<boolean, JsoncParseError> =>
		Effect.map(Effect.all([parse(self), parse(that)]), ([a, b]) => deepEqual(a, b)),
);

/**
 * Compare a JSONC string against a JavaScript value for semantic equality.
 *
 * Supports {@link https://effect.website/docs/effect/function#dual | Function.dual}
 * for both data-first and data-last (pipeline) usage.
 *
 * @param self - The JSONC string to parse.
 * @param value - The JavaScript value to compare against.
 *
 * @returns `Effect<boolean, JsoncParseError>` — `true` when the parsed JSONC
 *   is semantically equivalent to the provided value, `false` otherwise.
 *   Fails with {@link JsoncParseError} if the string is malformed.
 *
 * @remarks
 * Only the JSONC string is parsed; the JS value is used as-is. This makes
 * `equalsValue` useful for assertions and testing where the expected value
 * is already a JS object. The comparison semantics are the same as
 * {@link equals}: comments, whitespace, formatting, and object key ordering
 * are ignored, while array order IS significant.
 *
 * @see {@link equals} — compare two JSONC strings against each other
 * @see {@link parse} — the underlying parser
 *
 * @example Basic comparison
 * ```ts
 * import { Effect } from "effect";
 * import { equalsValue } from "jsonc-effect";
 *
 * const result = Effect.runSync(
 *   equalsValue('{"port": 3000, "host": "localhost"}', { host: "localhost", port: 3000 })
 * );
 * // result is true
 * ```
 *
 * @example Pipeline usage for testing
 * ```ts
 * import { Effect, pipe } from "effect";
 * import { equalsValue } from "jsonc-effect";
 *
 * const jsonc = '{ "enabled": true, "count": 5 }';
 * const expected = { enabled: true, count: 5 };
 *
 * const result = Effect.runSync(
 *   pipe(jsonc, equalsValue(expected))
 * );
 * // result is true
 * ```
 *
 * @public
 */
export const equalsValue: {
	(value: unknown): (self: string) => Effect.Effect<boolean, JsoncParseError>;
	(self: string, value: unknown): Effect.Effect<boolean, JsoncParseError>;
} = Fn.dual(
	2,
	(self: string, value: unknown): Effect.Effect<boolean, JsoncParseError> =>
		Effect.map(parse(self), (parsed) => deepEqual(parsed, value)),
);
