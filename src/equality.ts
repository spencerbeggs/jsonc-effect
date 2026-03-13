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
 * Deep-compare two values for equality.
 *
 * - Objects: key-order independent, recursively compared
 * - Arrays: order sensitive, recursively compared
 * - Primitives and null: strict equality
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
 * Parses both strings and deep-compares the resulting values.
 * Ignores comments, whitespace, formatting, and object key ordering.
 * Array order is significant.
 *
 * Supports `Function.dual` for data-first and data-last (pipeline) usage.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { equals } from "jsonc-effect";
 *
 * // Data-first
 * Effect.runSync(equals('{"a":1}', '{ "a": 1 }')); // true
 *
 * // Pipeline
 * Effect.runSync('{"a":1}'.pipe(equals('{ "a": 1 }'))); // won't compile — use Effect pipe
 * ```
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
 * Parses the JSONC string and deep-compares against the provided value.
 * Ignores comments, whitespace, formatting, and object key ordering.
 * Array order is significant.
 *
 * Supports `Function.dual` for data-first and data-last (pipeline) usage.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { equalsValue } from "jsonc-effect";
 *
 * Effect.runSync(equalsValue('{"port": 3000}', { port: 3000 })); // true
 * ```
 */
export const equalsValue: {
	(value: unknown): (self: string) => Effect.Effect<boolean, JsoncParseError>;
	(self: string, value: unknown): Effect.Effect<boolean, JsoncParseError>;
} = Fn.dual(
	2,
	(self: string, value: unknown): Effect.Effect<boolean, JsoncParseError> =>
		Effect.map(parse(self), (parsed) => deepEqual(parsed, value)),
);
