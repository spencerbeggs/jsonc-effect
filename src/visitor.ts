/**
 * SAX-style visitor API for JSONC documents.
 *
 * Emits typed events as an Effect Stream, enabling memory-efficient
 * processing of large JSONC documents.
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
 * Uses the pure Effect scanner to drive the parse. The stream
 * emits events as the visitor encounters tokens.
 */
export const visit = (text: string, options?: Partial<JsoncParseOptions>): Stream.Stream<JsoncVisitorEvent> => {
	const events: JsoncVisitorEvent[] = [];
	visitImpl(text, events, options);
	return Stream.fromIterable(events);
};

/**
 * Visit JSONC text and collect all events matching a predicate.
 */
export const visitCollect = <A extends JsoncVisitorEvent>(
	text: string,
	predicate: (event: JsoncVisitorEvent) => event is A,
	options?: Partial<JsoncParseOptions>,
): Effect.Effect<ReadonlyArray<A>> =>
	visit(text, options).pipe(Stream.filter(predicate), Stream.runCollect, Effect.map(Chunk.toReadonlyArray));

function visitImpl(text: string, events: JsoncVisitorEvent[], options?: Partial<JsoncParseOptions>): void {
	const scanner = createScanner(text, false);
	const disallowComments = options?.disallowComments ?? false;
	const path: Array<string | number> = [];

	function scanNext(): JsoncSyntaxKind {
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
				events.push({
					_tag: "Error",
					code,
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				});
			}

			switch (t) {
				case "LineComment":
				case "BlockComment":
					if (disallowComments) {
						events.push({
							_tag: "Error",
							code: "InvalidCommentToken",
							offset: scanner.getTokenOffset(),
							length: scanner.getTokenLength(),
						});
					} else {
						events.push({
							_tag: "Comment",
							offset: scanner.getTokenOffset(),
							length: scanner.getTokenLength(),
						});
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

	function visitValue(): boolean {
		const t = scanner.getToken();
		switch (t) {
			case "OpenBrace":
				return visitObject();
			case "OpenBracket":
				return visitArray();
			case "String":
			case "Number":
			case "True":
			case "False":
			case "Null":
				events.push({
					_tag: "LiteralValue",
					value: getLiteralValue(t, scanner.getTokenValue()),
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
					path: [...path],
				});
				scanNext();
				return true;
			default:
				events.push({
					_tag: "Error",
					code: "ValueExpected",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				});
				return false;
		}
	}

	function visitObject(): boolean {
		events.push({
			_tag: "ObjectBegin",
			offset: scanner.getTokenOffset(),
			length: scanner.getTokenLength(),
			path: [...path],
		});

		scanNext(); // skip {
		let needsComma = false;

		while (scanner.getToken() !== "CloseBrace" && scanner.getToken() !== "EOF") {
			if (scanner.getToken() === "Comma") {
				events.push({
					_tag: "Separator",
					character: ",",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				});
				scanNext();
				if (scanner.getToken() === "CloseBrace") {
					break; // trailing comma
				}
			} else if (needsComma) {
				events.push({
					_tag: "Error",
					code: "CommaExpected",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				});
			}

			if (scanner.getToken() !== "String") {
				events.push({
					_tag: "Error",
					code: "PropertyNameExpected",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				});
				scanNext();
				continue;
			}

			const key = scanner.getTokenValue();
			events.push({
				_tag: "ObjectProperty",
				property: key,
				offset: scanner.getTokenOffset(),
				length: scanner.getTokenLength(),
				path: [...path],
			});
			path.push(key);

			scanNext(); // skip key
			if (scanner.getToken() === "Colon") {
				events.push({
					_tag: "Separator",
					character: ":",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				});
				scanNext(); // skip colon
			} else {
				events.push({
					_tag: "Error",
					code: "ColonExpected",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				});
			}

			visitValue();
			path.pop();
			needsComma = true;
		}

		if (scanner.getToken() === "CloseBrace") {
			events.push({
				_tag: "ObjectEnd",
				offset: scanner.getTokenOffset(),
				length: scanner.getTokenLength(),
			});
			scanNext();
		} else {
			events.push({
				_tag: "Error",
				code: "CloseBraceExpected",
				offset: scanner.getTokenOffset(),
				length: scanner.getTokenLength(),
			});
		}

		return true;
	}

	function visitArray(): boolean {
		events.push({
			_tag: "ArrayBegin",
			offset: scanner.getTokenOffset(),
			length: scanner.getTokenLength(),
			path: [...path],
		});

		scanNext(); // skip [
		let index = 0;
		let needsComma = false;

		while (scanner.getToken() !== "CloseBracket" && scanner.getToken() !== "EOF") {
			if (scanner.getToken() === "Comma") {
				events.push({
					_tag: "Separator",
					character: ",",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				});
				scanNext();
				if (scanner.getToken() === "CloseBracket") {
					break; // trailing comma
				}
			} else if (needsComma) {
				events.push({
					_tag: "Error",
					code: "CommaExpected",
					offset: scanner.getTokenOffset(),
					length: scanner.getTokenLength(),
				});
			}

			path.push(index);
			visitValue();
			path.pop();
			index++;
			needsComma = true;
		}

		if (scanner.getToken() === "CloseBracket") {
			events.push({
				_tag: "ArrayEnd",
				offset: scanner.getTokenOffset(),
				length: scanner.getTokenLength(),
			});
			scanNext();
		} else {
			events.push({
				_tag: "Error",
				code: "CloseBracketExpected",
				offset: scanner.getTokenOffset(),
				length: scanner.getTokenLength(),
			});
		}

		return true;
	}

	// Start parsing
	scanNext();
	if (scanner.getToken() !== "EOF") {
		visitValue();
	}
}
