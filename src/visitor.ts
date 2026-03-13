/**
 * SAX-style visitor API for JSONC documents.
 *
 * Emits typed events as an Effect Stream, enabling memory-efficient
 * processing of large JSONC documents via lazy evaluation.
 *
 * @packageDocumentation
 */

import { Chunk, Effect, Stream } from "effect";
import type { JsoncParseErrorCode } from "./errors.js";
import { createScanner } from "./scanner.js";
import type { JsoncParseOptions, JsoncSyntaxKind } from "./schemas.js";

/**
 * Discriminated union of JSONC visitor events.
 *
 * Each variant carries an `_tag` discriminant, an `offset`, and a `length`
 * describing where the event occurred in the source text. Some variants
 * include additional fields such as `path`, `value`, or `property`.
 *
 * @remarks
 * The nine event types are:
 *
 * - **ObjectBegin** — opening `{` of an object, includes `path`.
 * - **ObjectEnd** — closing `}` of an object.
 * - **ObjectProperty** — a property key, includes `property` and `path`.
 * - **ArrayBegin** — opening `[` of an array, includes `path`.
 * - **ArrayEnd** — closing `]` of an array.
 * - **LiteralValue** — a string, number, boolean, or null literal,
 *   includes `value` and `path`.
 * - **Separator** — a `,` or `:` character.
 * - **Comment** — a line or block comment.
 * - **Error** — a parse error, includes a {@link JsoncParseErrorCode} `code`.
 *
 * Use the `_tag` field to discriminate between variants in `switch`
 * statements or {@link https://effect.website/docs/stream/operations | Stream}
 * filter predicates.
 *
 * @see {@link visit} to produce a stream of these events.
 * @see {@link visitCollect} to collect matching events in one step.
 *
 * @example Filtering events by tag
 * ```ts
 * import { Chunk, Effect, Stream } from "effect";
 * import type { JsoncVisitorEvent } from "jsonc-effect";
 * import { visit } from "jsonc-effect";
 *
 * const literals = Effect.runSync(
 *   visit('{ "a": 1 }').pipe(
 *     Stream.filter(
 *       (e): e is Extract<JsoncVisitorEvent, { _tag: "LiteralValue" }> =>
 *         e._tag === "LiteralValue",
 *     ),
 *     Stream.runCollect,
 *     Effect.map(Chunk.toReadonlyArray),
 *   ),
 * );
 * ```
 *
 * @public
 */
export type JsoncVisitorEvent =
	| {
			readonly _tag: "ObjectBegin";
			readonly offset: number;
			readonly length: number;
			readonly path: ReadonlyArray<string | number>;
	  }
	| { readonly _tag: "ObjectEnd"; readonly offset: number; readonly length: number }
	| {
			readonly _tag: "ObjectProperty";
			readonly property: string;
			readonly offset: number;
			readonly length: number;
			readonly path: ReadonlyArray<string | number>;
	  }
	| {
			readonly _tag: "ArrayBegin";
			readonly offset: number;
			readonly length: number;
			readonly path: ReadonlyArray<string | number>;
	  }
	| { readonly _tag: "ArrayEnd"; readonly offset: number; readonly length: number }
	| {
			readonly _tag: "LiteralValue";
			readonly value: unknown;
			readonly offset: number;
			readonly length: number;
			readonly path: ReadonlyArray<string | number>;
	  }
	| { readonly _tag: "Separator"; readonly character: string; readonly offset: number; readonly length: number }
	| { readonly _tag: "Comment"; readonly offset: number; readonly length: number }
	| { readonly _tag: "Error"; readonly code: JsoncParseErrorCode; readonly offset: number; readonly length: number };

/**
 * Create a lazy `Stream` of {@link JsoncVisitorEvent} from JSONC text.
 *
 * Events are produced on demand as the stream is consumed, not
 * pre-collected into memory. This makes `visit` suitable for large
 * documents and supports early termination via `Stream.take` or
 * `Stream.takeWhile` without scanning the entire input.
 *
 * @param text - The JSONC source text to visit.
 * @param options - Optional partial {@link JsoncParseOptions} controlling
 *   comment handling and trailing-comma tolerance.
 * @returns A `Stream` of {@link JsoncVisitorEvent} objects.
 *
 * @remarks
 * The stream is backed by a lazy generator — no work is performed until
 * the stream is consumed. Because evaluation is demand-driven, combining
 * `visit` with `Stream.take` allows efficient partial scans of large
 * documents without allocating a full AST.
 *
 * @see {@link visitCollect} for a one-step filter-and-collect convenience.
 * @see {@link JsoncVisitorEvent} for the event type definitions.
 *
 * @example Collect all events
 * ```ts
 * import { Chunk, Effect, Stream } from "effect";
 * import { visit } from "jsonc-effect";
 *
 * const all = Effect.runSync(
 *   visit('{ "a": 1 }').pipe(
 *     Stream.runCollect,
 *     Effect.map(Chunk.toReadonlyArray),
 *   ),
 * );
 * ```
 *
 * @example Filter and take the first match
 * ```ts
 * import { Chunk, Effect, Stream } from "effect";
 * import { visit } from "jsonc-effect";
 *
 * const firstLiteral = Effect.runSync(
 *   visit('{ "a": 1, "b": 2 }').pipe(
 *     Stream.filter((e) => e._tag === "LiteralValue"),
 *     Stream.take(1),
 *     Stream.runCollect,
 *     Effect.map(Chunk.toReadonlyArray),
 *   ),
 * );
 * ```
 *
 * @example Extract property names
 * ```ts
 * import { Chunk, Effect, Stream } from "effect";
 * import { visit } from "jsonc-effect";
 *
 * const propertyNames = Effect.runSync(
 *   visit('{ "name": "Alice", "age": 30 }').pipe(
 *     Stream.filter((e) => e._tag === "ObjectProperty"),
 *     Stream.map((e) => (e as { property: string }).property),
 *     Stream.runCollect,
 *     Effect.map(Chunk.toReadonlyArray),
 *   ),
 * );
 * ```
 *
 * @privateRemarks
 * Internally wraps a generator function with `Stream.fromIterable`,
 * preserving laziness. The generator yields events as it encounters
 * tokens from the scanner.
 *
 * @public
 */
export const visit = (text: string, options?: Partial<JsoncParseOptions>): Stream.Stream<JsoncVisitorEvent> =>
	Stream.fromIterable(visitGen(text, options));

/**
 * Visit JSONC text and collect all events matching a type-guard predicate.
 *
 * This is a convenience that composes {@link visit}, `Stream.filter`, and
 * `Stream.runCollect` into a single call.
 *
 * @param text - The JSONC source text to visit.
 * @param predicate - A type-guard function that narrows
 *   {@link JsoncVisitorEvent} to the desired subtype `A`.
 * @param options - Optional partial {@link JsoncParseOptions}.
 * @returns An `Effect` that succeeds with a read-only array of the
 *   matched events.
 *
 * @remarks
 * Equivalent to:
 * ```
 * visit(text, options) |> Stream.filter(predicate) |> Stream.runCollect
 * ```
 * Use this when you need all matching events and do not require
 * intermediate stream transformations.
 *
 * @see {@link visit} for full stream-level control.
 *
 * @example Collecting literal values
 * ```ts
 * import { Effect } from "effect";
 * import type { JsoncVisitorEvent } from "jsonc-effect";
 * import { visitCollect } from "jsonc-effect";
 *
 * const literals = Effect.runSync(
 *   visitCollect(
 *     '{ "a": 1, "b": true }',
 *     (e): e is Extract<JsoncVisitorEvent, { _tag: "LiteralValue" }> =>
 *       e._tag === "LiteralValue",
 *   ),
 * );
 * ```
 *
 * @public
 */
export const visitCollect = <A extends JsoncVisitorEvent>(
	text: string,
	predicate: (event: JsoncVisitorEvent) => event is A,
	options?: Partial<JsoncParseOptions>,
): Effect.Effect<ReadonlyArray<A>> =>
	visit(text, options).pipe(Stream.filter(predicate), Stream.runCollect, Effect.map(Chunk.toReadonlyArray));

function* visitGen(text: string, options?: Partial<JsoncParseOptions>): Generator<JsoncVisitorEvent> {
	const scanner = createScanner(text, false);
	const disallowComments = options?.disallowComments ?? false;
	const path: Array<string | number> = [];

	function* scanNext(): Generator<JsoncVisitorEvent, JsoncSyntaxKind> {
		for (;;) {
			const t = scanner.scan();

			// Handle scan errors
			const scanError = scanner.getTokenError();
			if (scanError !== "None") {
				let code: JsoncParseErrorCode;
				switch (scanError) {
					case "InvalidUnicode":
						code = "InvalidUnicode";
						break;
					case "InvalidEscapeCharacter":
						code = "InvalidEscapeCharacter";
						break;
					case "UnexpectedEndOfNumber":
						code = "InvalidNumberFormat";
						break;
					case "UnexpectedEndOfComment":
						code = "UnexpectedEndOfComment";
						break;
					case "UnexpectedEndOfString":
						code = "UnexpectedEndOfString";
						break;
					case "InvalidCharacter":
						code = "InvalidCharacter";
						break;
					default:
						code = "InvalidSymbol";
				}
				yield {
					_tag: "Error",
					code,
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				};
			}

			switch (t) {
				case "LineComment":
				case "BlockComment":
					if (disallowComments) {
						yield {
							_tag: "Error",
							code: "InvalidCommentToken",
							offset: scanner.getTokenOffset(),
							length: scanner.getTokenLength(),
						};
					} else {
						yield {
							_tag: "Comment",
							offset: scanner.getTokenOffset(),
							length: scanner.getTokenLength(),
						};
					}
					break;
				case "Trivia":
				case "LineBreak":
					break;
				default:
					return t;
			}
		}
	}

	function getLiteralValue(kind: JsoncSyntaxKind, tokenValue: string): unknown {
		switch (kind) {
			case "String":
				return tokenValue;
			case "Number":
				return Number.parseFloat(tokenValue);
			case "True":
				return true;
			case "False":
				return false;
			case "Null":
				return null;
			default:
				return undefined;
		}
	}

	function* visitValue(): Generator<JsoncVisitorEvent, boolean> {
		const t = scanner.getToken();
		switch (t) {
			case "OpenBrace":
				return yield* visitObject();
			case "OpenBracket":
				return yield* visitArray();
			case "String":
			case "Number":
			case "True":
			case "False":
			case "Null":
				yield {
					_tag: "LiteralValue",
					value: getLiteralValue(t, scanner.getTokenValue()),
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
					path: [...path],
				};
				yield* scanNext();
				return true;
			default:
				yield {
					_tag: "Error",
					code: "ValueExpected",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				};
				return false;
		}
	}

	function* visitObject(): Generator<JsoncVisitorEvent, boolean> {
		yield {
			_tag: "ObjectBegin",
			offset: scanner.getTokenOffset(),
			length: scanner.getTokenLength(),
			path: [...path],
		};

		yield* scanNext(); // skip {
		let needsComma = false;

		while (scanner.getToken() !== "CloseBrace" && scanner.getToken() !== "EOF") {
			if (scanner.getToken() === "Comma") {
				yield {
					_tag: "Separator",
					character: ",",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				};
				yield* scanNext();
				if (scanner.getToken() === "CloseBrace") {
					break; // trailing comma
				}
			} else if (needsComma) {
				yield {
					_tag: "Error",
					code: "CommaExpected",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				};
			}

			if (scanner.getToken() !== "String") {
				yield {
					_tag: "Error",
					code: "PropertyNameExpected",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				};
				yield* scanNext();
				continue;
			}

			const key = scanner.getTokenValue();
			yield {
				_tag: "ObjectProperty",
				property: key,
				offset: scanner.getTokenOffset(),
				length: scanner.getTokenLength(),
				path: [...path],
			};
			path.push(key);

			yield* scanNext(); // skip key
			if (scanner.getToken() === "Colon") {
				yield {
					_tag: "Separator",
					character: ":",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				};
				yield* scanNext(); // skip colon
			} else {
				yield {
					_tag: "Error",
					code: "ColonExpected",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				};
			}

			yield* visitValue();
			path.pop();
			needsComma = true;
		}

		if (scanner.getToken() === "CloseBrace") {
			yield {
				_tag: "ObjectEnd",
				offset: scanner.getTokenOffset(),
				length: scanner.getTokenLength(),
			};
			yield* scanNext();
		} else {
			yield {
				_tag: "Error",
				code: "CloseBraceExpected",
				offset: scanner.getTokenOffset(),
				length: scanner.getTokenLength(),
			};
		}

		return true;
	}

	function* visitArray(): Generator<JsoncVisitorEvent, boolean> {
		yield {
			_tag: "ArrayBegin",
			offset: scanner.getTokenOffset(),
			length: scanner.getTokenLength(),
			path: [...path],
		};

		yield* scanNext(); // skip [
		let index = 0;
		let needsComma = false;

		while (scanner.getToken() !== "CloseBracket" && scanner.getToken() !== "EOF") {
			if (scanner.getToken() === "Comma") {
				yield {
					_tag: "Separator",
					character: ",",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				};
				yield* scanNext();
				if (scanner.getToken() === "CloseBracket") {
					break; // trailing comma
				}
			} else if (needsComma) {
				yield {
					_tag: "Error",
					code: "CommaExpected",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				};
			}

			path.push(index);
			yield* visitValue();
			path.pop();
			index++;
			needsComma = true;
		}

		if (scanner.getToken() === "CloseBracket") {
			yield {
				_tag: "ArrayEnd",
				offset: scanner.getTokenOffset(),
				length: scanner.getTokenLength(),
			};
			yield* scanNext();
		} else {
			yield {
				_tag: "Error",
				code: "CloseBracketExpected",
				offset: scanner.getTokenOffset(),
				length: scanner.getTokenLength(),
			};
		}

		return true;
	}

	// Start parsing
	yield* scanNext();
	if (scanner.getToken() !== "EOF") {
		yield* visitValue();
	}
}
