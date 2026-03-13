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
 * Create a Stream of visitor events from JSONC text.
 *
 * Uses a lazy generator internally — events are produced on demand
 * as the stream is consumed, not pre-collected into memory.
 *
 * @example
 * ```ts
 * import { Chunk, Effect, Stream } from "effect";
 * import { visit } from "@spencerbeggs/jsonc-effect";
 *
 * // Collect all events
 * const all = Effect.runSync(
 *   visit('{ "a": 1 }').pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
 * );
 *
 * // Take only the first 3 events (lazy — won't scan entire document)
 * const first3 = Effect.runSync(
 *   visit(largeDoc).pipe(Stream.take(3), Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
 * );
 * ```
 */
export const visit = (text: string, options?: Partial<JsoncParseOptions>): Stream.Stream<JsoncVisitorEvent> =>
	Stream.fromIterable(visitGen(text, options));

/**
 * Visit JSONC text and collect all events matching a predicate.
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
