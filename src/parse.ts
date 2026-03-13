/**
 * JSONC Parser — converts token stream into JavaScript values or AST nodes.
 *
 * Pure Effect implementation using recursive descent parsing.
 * Reference: Microsoft's jsonc-parser parser design (MIT).
 *
 * @packageDocumentation
 */

import { Effect, Option } from "effect";
import { JsoncParseError, JsoncParseErrorDetail } from "./errors.js";
import { createScanner } from "./scanner.js";
import type { JsoncNode, JsoncParseOptions, JsoncSyntaxKind } from "./schemas.js";

/**
 * Parse a JSONC string into a JavaScript value.
 *
 * @param text - JSONC string to parse
 * @param options - Optional {@link JsoncParseOptions} controlling comment and
 *   trailing-comma handling.
 * @returns `Effect<unknown, JsoncParseError>` — succeeds with the parsed value
 *   or fails with a {@link JsoncParseError} containing every error encountered.
 *
 * @remarks
 * The return type is `unknown` (not `any`) so consumers are forced to narrow
 * the result, which is safer in Effect pipelines. By default
 * `allowTrailingComma` is `true`, matching common JSONC conventions used in
 * VS Code settings and `tsconfig.json`.
 *
 * @see {@link parseTree} — parse into an AST instead of a plain value
 * @see {@link JsoncParseOptions} — available parse options
 * @see {@link JsoncParseError} — the tagged error type on the failure channel
 *
 * @example
 * Basic parsing:
 * ```ts
 * import { Effect } from "effect";
 * import { parse } from "jsonc-effect";
 *
 * const value = Effect.runSync(parse('{ "key": 42 }'));
 * console.log(value); // { key: 42 }
 * ```
 *
 * @example
 * Parsing with options:
 * ```ts
 * import { Effect } from "effect";
 * import { parse } from "jsonc-effect";
 *
 * const value = Effect.runSync(
 *   parse('{ "key": 42 }', { disallowComments: true }),
 * );
 * ```
 *
 * @example
 * Error handling with `catchTag`:
 * ```ts
 * import { Effect } from "effect";
 * import { parse } from "jsonc-effect";
 *
 * const program = parse("{ bad }").pipe(
 *   Effect.catchTag("JsoncParseError", (err) =>
 *     Effect.succeed({ fallback: true, errors: err.errors }),
 *   ),
 * );
 *
 * const result = Effect.runSync(program);
 * console.log(result);
 * ```
 *
 * @example
 * Using `Effect.gen`:
 * ```ts
 * import { Effect } from "effect";
 * import { parse } from "jsonc-effect";
 *
 * const program = Effect.gen(function* () {
 *   const config = yield* parse('{ "port": 3000 }');
 *   return config;
 * });
 *
 * const result = Effect.runSync(program);
 * console.log(result); // { port: 3000 }
 * ```
 *
 * @privateRemarks
 * Uses {@link createScanner} internally with a recursive descent parser.
 * The scanner is created with `ignoreTrivia = false` so the parser can
 * report comment-related errors when `disallowComments` is set.
 *
 * @public
 */
export const parse: {
	(text: string): Effect.Effect<unknown, JsoncParseError>;
	(text: string, options: Partial<JsoncParseOptions>): Effect.Effect<unknown, JsoncParseError>;
} = (text: string, options?: Partial<JsoncParseOptions>): Effect.Effect<unknown, JsoncParseError> =>
	Effect.sync(() => parseInternal(text, options ?? {}, false)).pipe(
		Effect.flatMap(({ value, errors }) => {
			if (errors.length > 0) {
				return Effect.fail(
					new JsoncParseError({
						errors,
						text,
						...(options !== undefined ? { options } : {}),
					}),
				);
			}
			return Effect.succeed(value);
		}),
	);

/**
 * Parse a JSONC string into an immutable AST.
 *
 * @param text - JSONC string to parse
 * @param options - Optional {@link JsoncParseOptions} controlling comment and
 *   trailing-comma handling.
 * @returns `Effect<Option<JsoncNode>, JsoncParseError>` — succeeds with
 *   `Option.some(root)` for non-empty documents or `Option.none()` when the
 *   input is empty (and `allowEmptyContent` is set).
 *
 * @remarks
 * The returned AST is immutable and does **not** contain parent pointers, which
 * keeps nodes safe to share across fibers. Use the AST navigation helpers
 * ({@link findNode}, {@link getNodeValue}) to traverse and extract values from
 * the tree.
 *
 * `Option.none()` is returned only when the document contains no value tokens
 * and `allowEmptyContent` is enabled; otherwise an empty document produces a
 * {@link JsoncParseError}.
 *
 * @see {@link parse} — parse into a plain JavaScript value instead of an AST
 * @see {@link findNode} — locate a node by JSON path segments
 * @see {@link getNodeValue} — extract the JavaScript value from a subtree
 * @see {@link JsoncNode} — the AST node type
 *
 * @example
 * Parsing a JSONC string and navigating the tree:
 * ```ts
 * import { Effect, Option } from "effect";
 * import { parseTree } from "jsonc-effect";
 *
 * const program = Effect.gen(function* () {
 *   const maybeRoot = yield* parseTree('{ "a": [1, 2, 3] }');
 *   if (Option.isSome(maybeRoot)) {
 *     const root = maybeRoot.value;
 *     console.log(root.type); // "object"
 *     console.log(root.children?.length); // 1
 *   }
 * });
 *
 * Effect.runSync(program);
 * ```
 *
 * @privateRemarks
 * Internally the parser builds a mutable tree using `MutableJsoncNode` and
 * casts to the readonly `JsoncNode` on output.
 *
 * @public
 */
export const parseTree: {
	(text: string): Effect.Effect<Option.Option<JsoncNode>, JsoncParseError>;
	(text: string, options: Partial<JsoncParseOptions>): Effect.Effect<Option.Option<JsoncNode>, JsoncParseError>;
} = (text: string, options?: Partial<JsoncParseOptions>): Effect.Effect<Option.Option<JsoncNode>, JsoncParseError> =>
	Effect.sync(() => parseInternal(text, options ?? {}, true)).pipe(
		Effect.flatMap(({ root, errors }) => {
			if (errors.length > 0) {
				return Effect.fail(
					new JsoncParseError({
						errors,
						text,
						...(options !== undefined ? { options } : {}),
					}),
				);
			}
			return Effect.succeed(root ? Option.some(root) : Option.none());
		}),
	);

/**
 * Remove all comments from JSONC text, producing valid JSON.
 *
 * @param text - JSONC string to strip comments from
 * @param replaceCh - Optional single character used to replace each character of
 *   every comment. When provided, the output has the **same length** as the
 *   input so that all offsets are preserved (line breaks inside block comments
 *   are kept as-is).
 * @returns `Effect<string>` — the text with all comments removed (or replaced).
 *
 * @remarks
 * When `replaceCh` is omitted the comment text is simply deleted, which means
 * character offsets in the output no longer match the original document. Pass a
 * space (`" "`) as `replaceCh` to keep offsets stable — this is useful when you
 * need to correlate positions between the original JSONC and the stripped JSON.
 *
 * @see {@link parse} — parse JSONC directly without a stripping step
 *
 * @example
 * Basic comment stripping:
 * ```ts
 * import { Effect } from "effect";
 * import { stripComments } from "jsonc-effect";
 *
 * const json = Effect.runSync(
 *   stripComments('{ "a": 1 // comment\n}'),
 * );
 * console.log(json); // '{ "a": 1 \n}'
 * ```
 *
 * @example
 * Using a replacement character to preserve offsets:
 * ```ts
 * import { Effect } from "effect";
 * import { stripComments } from "jsonc-effect";
 *
 * const json = Effect.runSync(
 *   stripComments('{ "a": 1 // comment\n}', " "),
 * );
 * console.log(json.length === '{ "a": 1 // comment\n}'.length); // true
 * ```
 *
 * @public
 */
export const stripComments: {
	(text: string): Effect.Effect<string>;
	(text: string, replaceCh: string): Effect.Effect<string>;
} = (text: string, replaceCh?: string): Effect.Effect<string> =>
	Effect.sync(() => {
		const scanner = createScanner(text);
		const parts: string[] = [];
		let lastOffset = 0;
		let kind: JsoncSyntaxKind;

		do {
			kind = scanner.scan();
			const offset = scanner.getTokenOffset();
			const length = scanner.getTokenLength();

			if (kind === "LineComment" || kind === "BlockComment") {
				// Add text before the comment
				if (lastOffset < offset) {
					parts.push(text.substring(lastOffset, offset));
				}
				// Replace with spaces or replacement char
				if (replaceCh !== undefined) {
					for (let i = 0; i < length; i++) {
						const ch = text.charCodeAt(offset + i);
						parts.push(ch === 0x0a || ch === 0x0d ? text[offset + i] : replaceCh);
					}
				}
				lastOffset = offset + length;
			}
		} while (kind !== "EOF");

		if (lastOffset < text.length) {
			parts.push(text.substring(lastOffset));
		}

		return parts.join("");
	});

interface ParseResult {
	value: unknown;
	root: JsoncNode | undefined;
	errors: JsoncParseErrorDetail[];
}

function parseInternal(text: string, options: Partial<JsoncParseOptions>, buildTree: boolean): ParseResult {
	const scanner = createScanner(text, false);
	const errors: JsoncParseErrorDetail[] = [];
	const disallowComments = options.disallowComments ?? false;
	const allowTrailingComma = options.allowTrailingComma ?? true;
	const allowEmptyContent = options.allowEmptyContent ?? false;

	let currentToken: JsoncSyntaxKind = "Unknown";

	// Defeats TS control-flow narrowing — scanNext() mutates currentToken via closure
	function token(): JsoncSyntaxKind {
		return currentToken;
	}

	function scanNext(): JsoncSyntaxKind {
		for (;;) {
			currentToken = scanner.scan();
			switch (scanner.getTokenError()) {
				case "InvalidUnicode":
					handleError("InvalidUnicode");
					break;
				case "InvalidEscapeCharacter":
					handleError("InvalidEscapeCharacter");
					break;
				case "UnexpectedEndOfNumber":
					handleError("InvalidNumberFormat");
					break;
				case "UnexpectedEndOfComment":
					handleError("UnexpectedEndOfComment");
					break;
				case "UnexpectedEndOfString":
					handleError("UnexpectedEndOfString");
					break;
				case "InvalidCharacter":
					handleError("InvalidCharacter");
					break;
			}
			switch (currentToken) {
				case "LineComment":
				case "BlockComment":
					if (disallowComments) {
						handleError("InvalidCommentToken");
					}
					break;
				case "Trivia":
				case "LineBreak":
					break;
				default:
					return currentToken;
			}
		}
	}

	function handleError(
		code: JsoncParseErrorDetail["code"],
		skipUntilAfter: JsoncSyntaxKind[] = [],
		skipUntil: JsoncSyntaxKind[] = [],
	): void {
		errors.push(
			new JsoncParseErrorDetail({
				code,
				message: formatError(code, scanner.getTokenOffset()),
				offset: scanner.getTokenOffset(),
				length: scanner.getTokenLength(),
				startLine: scanner.getTokenStartLine(),
				startCharacter: scanner.getTokenStartCharacter(),
			}),
		);
		if (skipUntilAfter.length > 0 || skipUntil.length > 0) {
			let t = token();
			while (t !== "EOF") {
				if (skipUntilAfter.includes(t)) {
					scanNext();
					break;
				}
				if (skipUntil.includes(t)) {
					break;
				}
				t = scanNext();
			}
		}
	}

	function parseValue(): unknown {
		switch (token()) {
			case "OpenBracket":
				return parseArray();
			case "OpenBrace":
				return parseObject();
			case "String":
				return parseString();
			case "Number":
				return parseNumber();
			case "True":
				scanNext();
				return true;
			case "False":
				scanNext();
				return false;
			case "Null":
				scanNext();
				return null;
			default:
				return undefined;
		}
	}

	function parseString(): string {
		const value = scanner.getTokenValue();
		scanNext();
		return value;
	}

	function parseNumber(): number {
		const value = Number.parseFloat(scanner.getTokenValue());
		scanNext();
		return value;
	}

	function parseArray(): unknown[] {
		scanNext(); // skip [
		const arr: unknown[] = [];
		let needsComma = false;

		while (token() !== "CloseBracket" && token() !== "EOF") {
			if (token() === "Comma") {
				if (!needsComma) {
					handleError("ValueExpected");
				}
				scanNext();
				if (token() === "CloseBracket" && allowTrailingComma) {
					break;
				}
			} else if (needsComma) {
				handleError("CommaExpected");
			}
			const value = parseValue();
			if (value === undefined) {
				handleError("ValueExpected", [], ["CloseBracket", "Comma"]);
			} else {
				arr.push(value);
			}
			needsComma = true;
		}

		if (token() !== "CloseBracket") {
			handleError("CloseBracketExpected");
		} else {
			scanNext();
		}

		return arr;
	}

	function parseObject(): Record<string, unknown> {
		scanNext(); // skip {
		const obj: Record<string, unknown> = {};
		let needsComma = false;

		while (token() !== "CloseBrace" && token() !== "EOF") {
			if (token() === "Comma") {
				if (!needsComma) {
					handleError("PropertyNameExpected");
				}
				scanNext();
				if (token() === "CloseBrace" && allowTrailingComma) {
					break;
				}
			} else if (needsComma) {
				handleError("CommaExpected");
			}
			if (token() !== "String") {
				handleError("PropertyNameExpected", [], ["CloseBrace", "Comma"]);
				continue;
			}
			const key = scanner.getTokenValue();
			scanNext();
			if (token() !== "Colon") {
				handleError("ColonExpected", [], ["CloseBrace", "Comma"]);
				continue;
			}
			scanNext();
			const value = parseValue();
			if (value === undefined) {
				handleError("ValueExpected", [], ["CloseBrace", "Comma"]);
			} else {
				obj[key] = value;
			}
			needsComma = true;
		}

		if (token() !== "CloseBrace") {
			handleError("CloseBraceExpected");
		} else {
			scanNext();
		}

		return obj;
	}

	// Parse tree functions
	function parseValueTree(): JsoncNode | undefined {
		switch (token()) {
			case "OpenBracket":
				return parseArrayTree();
			case "OpenBrace":
				return parseObjectTree();
			case "String": {
				const node: MutableJsoncNode = {
					type: "string",
					offset: scanner.getTokenOffset(),
					length: 0,
					value: scanner.getTokenValue(),
				};
				scanNext();
				node.length = scanner.getTokenOffset() - node.offset;
				return node as JsoncNode;
			}
			case "Number": {
				const node: MutableJsoncNode = {
					type: "number",
					offset: scanner.getTokenOffset(),
					length: 0,
					value: Number.parseFloat(scanner.getTokenValue()),
				};
				scanNext();
				node.length = scanner.getTokenOffset() - node.offset;
				return node as JsoncNode;
			}
			case "True": {
				const node: MutableJsoncNode = {
					type: "boolean",
					offset: scanner.getTokenOffset(),
					length: 0,
					value: true,
				};
				scanNext();
				node.length = scanner.getTokenOffset() - node.offset;
				return node as JsoncNode;
			}
			case "False": {
				const node: MutableJsoncNode = {
					type: "boolean",
					offset: scanner.getTokenOffset(),
					length: 0,
					value: false,
				};
				scanNext();
				node.length = scanner.getTokenOffset() - node.offset;
				return node as JsoncNode;
			}
			case "Null": {
				const node: MutableJsoncNode = {
					type: "null",
					offset: scanner.getTokenOffset(),
					length: 0,
					value: null,
				};
				scanNext();
				node.length = scanner.getTokenOffset() - node.offset;
				return node as JsoncNode;
			}
			default:
				return undefined;
		}
	}

	function parseArrayTree(): JsoncNode {
		const node: MutableJsoncNode = {
			type: "array",
			offset: scanner.getTokenOffset(),
			length: 0,
			children: [],
		};
		scanNext(); // skip [
		let needsComma = false;

		while (token() !== "CloseBracket" && token() !== "EOF") {
			if (token() === "Comma") {
				if (!needsComma) {
					handleError("ValueExpected");
				}
				scanNext();
				if (token() === "CloseBracket" && allowTrailingComma) {
					break;
				}
			} else if (needsComma) {
				handleError("CommaExpected");
			}
			const child = parseValueTree();
			if (child) {
				(node.children as MutableJsoncNode[]).push(child as MutableJsoncNode);
			} else {
				handleError("ValueExpected", [], ["CloseBracket", "Comma"]);
			}
			needsComma = true;
		}

		if (token() !== "CloseBracket") {
			handleError("CloseBracketExpected");
		} else {
			scanNext();
		}
		node.length = scanner.getTokenOffset() - node.offset;
		return node as JsoncNode;
	}

	function parseObjectTree(): JsoncNode {
		const node: MutableJsoncNode = {
			type: "object",
			offset: scanner.getTokenOffset(),
			length: 0,
			children: [],
		};
		scanNext(); // skip {
		let needsComma = false;

		while (token() !== "CloseBrace" && token() !== "EOF") {
			if (token() === "Comma") {
				if (!needsComma) {
					handleError("PropertyNameExpected");
				}
				scanNext();
				if (token() === "CloseBrace" && allowTrailingComma) {
					break;
				}
			} else if (needsComma) {
				handleError("CommaExpected");
			}
			if (token() !== "String") {
				handleError("PropertyNameExpected", [], ["CloseBrace", "Comma"]);
				continue;
			}

			const property: MutableJsoncNode = {
				type: "property",
				offset: scanner.getTokenOffset(),
				length: 0,
				children: [],
			};
			const keyNode: MutableJsoncNode = {
				type: "string",
				offset: scanner.getTokenOffset(),
				length: 0,
				value: scanner.getTokenValue(),
			};
			scanNext();
			keyNode.length = scanner.getTokenOffset() - keyNode.offset;
			(property.children as MutableJsoncNode[]).push(keyNode);

			if (token() !== "Colon") {
				handleError("ColonExpected", [], ["CloseBrace", "Comma"]);
				property.length = scanner.getTokenOffset() - property.offset;
				(node.children as MutableJsoncNode[]).push(property);
				continue;
			}
			property.colonOffset = scanner.getTokenOffset();
			scanNext();

			const valueNode = parseValueTree();
			if (valueNode) {
				(property.children as MutableJsoncNode[]).push(valueNode as MutableJsoncNode);
			} else {
				handleError("ValueExpected", [], ["CloseBrace", "Comma"]);
			}
			property.length = scanner.getTokenOffset() - property.offset;
			(node.children as MutableJsoncNode[]).push(property);
			needsComma = true;
		}

		if (token() !== "CloseBrace") {
			handleError("CloseBraceExpected");
		} else {
			scanNext();
		}
		node.length = scanner.getTokenOffset() - node.offset;
		return node as JsoncNode;
	}

	// Main execution
	scanNext();

	if (buildTree) {
		const root = parseValueTree();
		if (token() !== "EOF") {
			handleError("EndOfFileExpected");
		}
		if (!root && !allowEmptyContent) {
			handleError("ValueExpected");
		}
		return { value: undefined, root, errors };
	}

	const value = parseValue();
	if (token() !== "EOF") {
		handleError("EndOfFileExpected");
	}
	if (value === undefined && !allowEmptyContent) {
		handleError("ValueExpected");
	}
	return { value, root: undefined, errors };
}

interface MutableJsoncNode {
	type: JsoncNode["type"];
	offset: number;
	length: number;
	value?: unknown;
	colonOffset?: number;
	children?: MutableJsoncNode[];
}

function formatError(code: string, offset: number): string {
	switch (code) {
		case "InvalidSymbol":
			return `Invalid symbol at offset ${offset}`;
		case "InvalidNumberFormat":
			return `Invalid number format at offset ${offset}`;
		case "PropertyNameExpected":
			return `Property name expected at offset ${offset}`;
		case "ValueExpected":
			return `Value expected at offset ${offset}`;
		case "ColonExpected":
			return `Colon expected at offset ${offset}`;
		case "CommaExpected":
			return `Comma expected at offset ${offset}`;
		case "CloseBraceExpected":
			return `Close brace expected at offset ${offset}`;
		case "CloseBracketExpected":
			return `Close bracket expected at offset ${offset}`;
		case "EndOfFileExpected":
			return `End of file expected at offset ${offset}`;
		case "InvalidCommentToken":
			return `Comments not allowed at offset ${offset}`;
		case "UnexpectedEndOfComment":
			return `Unexpected end of comment at offset ${offset}`;
		case "UnexpectedEndOfString":
			return `Unexpected end of string at offset ${offset}`;
		case "UnexpectedEndOfNumber":
			return `Unexpected end of number at offset ${offset}`;
		case "InvalidUnicode":
			return `Invalid unicode escape at offset ${offset}`;
		case "InvalidEscapeCharacter":
			return `Invalid escape character at offset ${offset}`;
		case "InvalidCharacter":
			return `Invalid character at offset ${offset}`;
		default:
			return `Parse error at offset ${offset}`;
	}
}
