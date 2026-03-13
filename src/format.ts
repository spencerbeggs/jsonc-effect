/**
 * JSONC formatting, modification, and edit application.
 *
 * All functions compute edits (not mutations) — a natural fit
 * for Effect's functional style.
 *
 * @packageDocumentation
 */

import { Effect, Function as Fn } from "effect";
import { JsoncModificationError } from "./errors.js";
import { createScanner } from "./scanner.js";
import type { JsoncEdit, JsoncFormattingOptions, JsoncPath, JsoncRange, JsoncSyntaxKind } from "./schemas.js";

/**
 * Compute formatting edits for a JSONC document.
 *
 * Returns an array of {@link JsoncEdit} objects describing text replacements
 * that, when applied, produce a well-formatted document. The input text is
 * never mutated — apply the returned edits with {@link applyEdits}.
 *
 * @param text - The JSONC source text to format.
 * @param range - Optional sub-range to format. When provided, only edits
 *   within the range are returned.
 * @param options - Partial {@link JsoncFormattingOptions} controlling indent
 *   size, tabs vs. spaces, EOL style, and final-newline insertion.
 * @returns An `Effect` that succeeds with a read-only array of
 *   {@link JsoncEdit} objects.
 *
 * @remarks
 * This function is non-mutating by design. It computes a minimal set of
 * whitespace edits; structural changes (inserting or removing properties)
 * are handled by {@link modify}. The `range` parameter allows formatting a
 * subset of the document without touching surrounding text.
 *
 * @see {@link applyEdits} to apply the returned edits to the source text.
 * @see {@link formatAndApply} for a one-step format-and-apply convenience.
 * @see {@link JsoncFormattingOptions} for available formatting controls.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import type { JsoncEdit } from "jsonc-effect";
 * import { format, applyEdits } from "jsonc-effect";
 *
 * const input = '{"a":1, "b" :2}';
 * const edits: ReadonlyArray<JsoncEdit> = Effect.runSync(format(input));
 * const formatted: string = Effect.runSync(applyEdits(input, edits));
 * ```
 *
 * @privateRemarks
 * Uses {@link createScanner} internally to tokenize the input and compute
 * whitespace adjustments between consecutive non-trivia tokens.
 *
 * @public
 */
export const format = (
	text: string,
	range?: JsoncRange,
	options?: Partial<JsoncFormattingOptions>,
): Effect.Effect<ReadonlyArray<JsoncEdit>> => Effect.sync(() => formatImpl(text, range, options));

/**
 * Apply an array of text edits to JSONC source text.
 *
 * This is a {@link https://effect.website/docs/function-dual | Function.dual}
 * that supports both data-first and data-last (pipeline) usage.
 *
 * @param text - The original JSONC source text.
 * @param edits - A read-only array of {@link JsoncEdit} objects, typically
 *   produced by {@link format} or {@link modify}.
 * @returns An `Effect` that succeeds with the edited string.
 *
 * @remarks
 * Edits are sorted in reverse offset order before application so that
 * earlier edits do not shift the offsets of later ones. The original `edits`
 * array is not mutated.
 *
 * @see {@link format} to compute formatting edits.
 * @see {@link modify} to compute structural edits (insert, replace, remove).
 *
 * @example Data-first usage
 * ```ts
 * import { Effect } from "effect";
 * import { format, applyEdits } from "jsonc-effect";
 *
 * const input = '{"a":1}';
 * const edits = Effect.runSync(format(input));
 * const result: string = Effect.runSync(applyEdits(input, edits));
 * ```
 *
 * @example Pipeline with modify
 * ```ts
 * import { Effect, pipe } from "effect";
 * import { modify, applyEdits } from "jsonc-effect";
 *
 * const input = '{ "a": 1 }';
 * const result = pipe(
 *   input,
 *   modify(["a"], 42),
 *   Effect.flatMap((edits) => applyEdits(input, edits)),
 *   Effect.runSync,
 * );
 * ```
 *
 * @public
 */
export const applyEdits: {
	(edits: ReadonlyArray<JsoncEdit>): (text: string) => Effect.Effect<string>;
	(text: string, edits: ReadonlyArray<JsoncEdit>): Effect.Effect<string>;
} = Fn.dual(2, (text: string, edits: ReadonlyArray<JsoncEdit>) =>
	Effect.sync(() => {
		const sorted = [...edits].sort((a, b) => b.offset - a.offset);
		let result = text;
		for (const edit of sorted) {
			result = result.substring(0, edit.offset) + edit.content + result.substring(edit.offset + edit.length);
		}
		return result;
	}),
);

/**
 * Format a JSONC document in one step by computing edits and immediately
 * applying them.
 *
 * This is a convenience that combines {@link format} and {@link applyEdits}
 * into a single call.
 *
 * @param text - The JSONC source text to format.
 * @param range - Optional sub-range to restrict formatting to.
 * @param options - Partial {@link JsoncFormattingOptions} controlling indent
 *   size, tabs vs. spaces, EOL style, and final-newline insertion.
 * @returns An `Effect` that succeeds with the fully formatted string.
 *
 * @see {@link format} to obtain the edits without applying them.
 * @see {@link applyEdits} to apply edits separately.
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { formatAndApply } from "jsonc-effect";
 *
 * const input = '{"a":1, "b" :2}';
 * const formatted: string = Effect.runSync(formatAndApply(input));
 * ```
 *
 * @public
 */
export const formatAndApply = (
	text: string,
	range?: JsoncRange,
	options?: Partial<JsoncFormattingOptions>,
): Effect.Effect<string> => format(text, range, options).pipe(Effect.flatMap((edits) => applyEdits(text, edits)));

/**
 * Compute edits to insert, replace, or remove a value at a JSON path.
 *
 * This is a {@link https://effect.website/docs/function-dual | Function.dual}
 * that supports both data-first and data-last (pipeline) usage.
 *
 * @param text - The JSONC source text to modify.
 * @param path - A {@link JsoncPath} (array of string keys and numeric indices)
 *   identifying the target location in the JSON structure.
 * @param value - The value to set. Pass `undefined` to remove the
 *   property or array element at the given path.
 * @param options - Optional object with `formattingOptions` controlling
 *   indent size, tabs vs. spaces, and EOL style for generated text.
 * @returns An `Effect` that succeeds with a read-only array of
 *   {@link JsoncEdit} objects, or fails with a
 *   {@link JsoncModificationError} if the path cannot be navigated.
 *
 * @remarks
 * Setting `value` to `undefined` removes the targeted property or element,
 * including its surrounding comma. When inserting a new property into an
 * object, it is appended after the last existing property.
 *
 * @see {@link applyEdits} to apply the returned edits to the source text.
 * @see {@link JsoncModificationError} for the error type on navigation failure.
 *
 * @example Update an existing property
 * ```ts
 * import { Effect } from "effect";
 * import { modify, applyEdits } from "jsonc-effect";
 *
 * const input = '{ "a": 1 }';
 * const edits = Effect.runSync(modify(input, ["a"], 2));
 * const result: string = Effect.runSync(applyEdits(input, edits));
 * ```
 *
 * @example Insert a new property
 * ```ts
 * import { Effect } from "effect";
 * import { modify, applyEdits } from "jsonc-effect";
 *
 * const input = '{ "a": 1 }';
 * const edits = Effect.runSync(modify(input, ["b"], "hello"));
 * const result: string = Effect.runSync(applyEdits(input, edits));
 * ```
 *
 * @example Remove a property
 * ```ts
 * import { Effect } from "effect";
 * import { modify, applyEdits } from "jsonc-effect";
 *
 * const input = '{ "a": 1, "b": 2 }';
 * const edits = Effect.runSync(modify(input, ["a"], undefined));
 * const result: string = Effect.runSync(applyEdits(input, edits));
 * ```
 *
 * @example Pipeline (data-last) usage
 * ```ts
 * import { Effect, pipe } from "effect";
 * import { modify, applyEdits } from "jsonc-effect";
 *
 * const input = '{ "a": 1 }';
 * const result = pipe(
 *   input,
 *   modify(["a"], 42),
 *   Effect.flatMap((edits) => applyEdits(input, edits)),
 *   Effect.runSync,
 * );
 * ```
 *
 * @privateRemarks
 * Uses its own scanner-based navigation to locate the target path rather
 * than building a full AST via `parseTree`. This keeps the implementation
 * lightweight and avoids an intermediate allocation.
 *
 * @public
 */
export const modify: {
	(
		path: JsoncPath,
		value: unknown,
		options?: { formattingOptions?: Partial<JsoncFormattingOptions> },
	): (text: string) => Effect.Effect<ReadonlyArray<JsoncEdit>, JsoncModificationError>;
	(
		text: string,
		path: JsoncPath,
		value: unknown,
		options?: { formattingOptions?: Partial<JsoncFormattingOptions> },
	): Effect.Effect<ReadonlyArray<JsoncEdit>, JsoncModificationError>;
} = Fn.dual(
	(args: IArguments) => typeof args[0] === "string" && Array.isArray(args[1]),
	(
		text: string,
		path: JsoncPath,
		value: unknown,
		options?: { formattingOptions?: Partial<JsoncFormattingOptions> },
	): Effect.Effect<ReadonlyArray<JsoncEdit>, JsoncModificationError> =>
		Effect.try({
			try: () => modifyImpl(text, path, value, options?.formattingOptions),
			catch: (e) => new JsoncModificationError({ path, reason: String(e) }),
		}),
);

// ============================================================
// Format Implementation
// ============================================================

interface EditInfo {
	offset: number;
	length: number;
	content: string;
}

function formatImpl(
	text: string,
	range: JsoncRange | undefined,
	options: Partial<JsoncFormattingOptions> | undefined,
): EditInfo[] {
	const opts = {
		tabSize: options?.tabSize ?? 2,
		insertSpaces: options?.insertSpaces ?? true,
		eol: options?.eol ?? "\n",
		insertFinalNewline: options?.insertFinalNewline ?? false,
		keepLines: options?.keepLines ?? false,
	};
	const indentUnit = opts.insertSpaces ? " ".repeat(opts.tabSize) : "\t";
	const edits: EditInfo[] = [];
	const scanner = createScanner(text, false);

	const rangeStart = range?.offset ?? 0;
	const rangeEnd = range ? range.offset + range.length : text.length;

	let depth = 0;
	let prevTokenEnd = -1;
	let prevToken: JsoncSyntaxKind = "Unknown";
	let firstToken = true;

	function makeIndent(d: number): string {
		return indentUnit.repeat(d);
	}

	function addEdit(offset: number, length: number, content: string): void {
		if (offset >= rangeStart && offset + length <= rangeEnd) {
			if (text.substring(offset, offset + length) !== content) {
				edits.push({ offset, length, content });
			}
		}
	}

	let kind = scanner.scan();
	while (kind !== "EOF") {
		const tokenOffset = scanner.getTokenOffset();
		const tokenLength = scanner.getTokenLength();

		if (kind !== "Trivia" && kind !== "LineBreak") {
			if (!firstToken && prevTokenEnd >= 0) {
				const gap = text.substring(prevTokenEnd, tokenOffset);
				let expectedGap: string;

				if (kind === "CloseBrace" || kind === "CloseBracket") {
					depth--;
					expectedGap = opts.eol + makeIndent(depth);
				} else if (prevToken === "OpenBrace" || prevToken === "OpenBracket") {
					expectedGap = opts.eol + makeIndent(depth);
				} else if (prevToken === "Comma") {
					expectedGap = opts.eol + makeIndent(depth);
				} else if (prevToken === "Colon") {
					expectedGap = " ";
				} else if (kind === "LineComment" || kind === "BlockComment") {
					// Preserve comments on same line or start new line
					if (gap.includes("\n")) {
						expectedGap = opts.eol + makeIndent(depth);
					} else {
						expectedGap = " ";
					}
				} else if (prevToken === "LineComment") {
					expectedGap = opts.eol + makeIndent(depth);
				} else if (prevToken === "BlockComment") {
					if (gap.includes("\n")) {
						expectedGap = opts.eol + makeIndent(depth);
					} else {
						expectedGap = " ";
					}
				} else {
					expectedGap = gap;
				}

				if (opts.keepLines && gap.includes("\n")) {
					// In keepLines mode, preserve existing line structure
					expectedGap = gap;
				}

				addEdit(prevTokenEnd, tokenOffset - prevTokenEnd, expectedGap);
			}

			if (kind === "OpenBrace" || kind === "OpenBracket") {
				depth++;
			}

			prevToken = kind;
			prevTokenEnd = tokenOffset + tokenLength;
			firstToken = false;
		}

		kind = scanner.scan();
	}

	if (opts.insertFinalNewline && prevTokenEnd >= 0) {
		const trailing = text.substring(prevTokenEnd);
		if (!trailing.endsWith(opts.eol)) {
			// Append a final newline, replacing any existing trailing whitespace
			edits.push({ offset: prevTokenEnd, length: trailing.length, content: opts.eol });
		}
	}

	return edits;
}

// ============================================================
// Modify Implementation
// ============================================================

function modifyImpl(
	text: string,
	path: ReadonlyArray<string | number>,
	value: unknown,
	formattingOptions: Partial<JsoncFormattingOptions> | undefined,
): EditInfo[] {
	const opts = {
		tabSize: formattingOptions?.tabSize ?? 2,
		insertSpaces: formattingOptions?.insertSpaces ?? true,
		eol: formattingOptions?.eol ?? "\n",
	};
	const indentUnit = opts.insertSpaces ? " ".repeat(opts.tabSize) : "\t";

	if (path.length === 0) {
		// Replace entire document
		const content = value === undefined ? "" : JSON.stringify(value, null, opts.tabSize);
		return [{ offset: 0, length: text.length, content }];
	}

	// Use scanner to find the target location
	const scanner = createScanner(text, true);
	let currentToken = scanner.scan();

	function skipValue(): void {
		switch (currentToken) {
			case "OpenBrace": {
				currentToken = scanner.scan();
				let first = true;
				while (currentToken !== "CloseBrace" && currentToken !== "EOF") {
					if (!first && currentToken === "Comma") {
						currentToken = scanner.scan();
					}
					if (currentToken === "String") {
						currentToken = scanner.scan(); // skip key
						if (currentToken === "Colon") {
							currentToken = scanner.scan(); // skip colon
							skipValue(); // skip value
						}
					} else {
						currentToken = scanner.scan();
					}
					first = false;
				}
				if (currentToken === "CloseBrace") {
					currentToken = scanner.scan();
				}
				break;
			}
			case "OpenBracket": {
				currentToken = scanner.scan();
				let first = true;
				while (currentToken !== "CloseBracket" && currentToken !== "EOF") {
					if (!first && currentToken === "Comma") {
						currentToken = scanner.scan();
					}
					skipValue();
					first = false;
				}
				if (currentToken === "CloseBracket") {
					currentToken = scanner.scan();
				}
				break;
			}
			default:
				currentToken = scanner.scan();
				break;
		}
	}

	// Navigate to target
	let depth = 0;
	for (const segment of path) {
		depth++;
		if (typeof segment === "string") {
			// Navigate into object to find property
			if (currentToken !== "OpenBrace") {
				throw new Error(`Expected object at depth ${depth}`);
			}
			currentToken = scanner.scan();
			let found = false;
			let lastValueEnd = scanner.getTokenOffset();
			let isFirst = true;

			while (currentToken !== "CloseBrace" && currentToken !== "EOF") {
				if (!isFirst && currentToken === "Comma") {
					currentToken = scanner.scan();
				}
				if (currentToken === "String") {
					const key = scanner.getTokenValue();
					currentToken = scanner.scan(); // skip key
					if (currentToken === "Colon") {
						currentToken = scanner.scan(); // skip colon
					}
					if (key === segment) {
						found = true;
						if (depth === path.length) {
							// This is our target
							const valueStart = scanner.getTokenOffset();
							const prevEnd = valueStart;
							skipValue();
							const valueEnd = scanner.getTokenOffset();

							if (value === undefined) {
								// Remove property — find the key start and handle commas
								let removeStart = valueStart;
								let removeEnd = valueEnd;

								// Find the key start by searching backwards from the value.
								// Note: this assumes the segment does not contain unescaped
								// double-quote characters. Property names with embedded quotes
								// (e.g. 'foo"bar') would need the segment escaped before search.
								const keySearchArea = text.substring(0, valueStart);
								const keyStart = keySearchArea.lastIndexOf(`"${segment}"`);
								if (keyStart >= 0) {
									removeStart = keyStart;
								}

								// Try to remove leading comma + whitespace before the key
								const beforeKey = text.substring(0, removeStart).trimEnd();
								const commaPosBefore = beforeKey.lastIndexOf(",");
								if (commaPosBefore >= 0) {
									removeStart = commaPosBefore;
								} else {
									// No leading comma — remove trailing comma instead
									const afterValue = text.substring(removeEnd);
									const trimmedAfter = afterValue.match(/^(\s*,)/);
									if (trimmedAfter) {
										removeEnd += trimmedAfter[1].length;
									}
								}
								return [{ offset: removeStart, length: removeEnd - removeStart, content: "" }];
							}
							const serialized = JSON.stringify(value, null, opts.tabSize);
							return [{ offset: prevEnd, length: valueEnd - prevEnd, content: serialized }];
						}
						break;
					}
					skipValue();
				} else {
					currentToken = scanner.scan();
				}
				lastValueEnd = scanner.getTokenOffset();
				isFirst = false;
			}

			if (!found && depth === path.length && value !== undefined) {
				// Insert new property
				const indent = indentUnit.repeat(depth);
				const serialized = JSON.stringify(value, null, opts.tabSize);
				const insertText = isFirst
					? `${opts.eol}${indent}"${segment}": ${serialized}${opts.eol}${indentUnit.repeat(depth - 1)}`
					: `,${opts.eol}${indent}"${segment}": ${serialized}`;
				return [{ offset: lastValueEnd, length: 0, content: insertText }];
			}
		} else {
			// Navigate into array
			if (currentToken !== "OpenBracket") {
				throw new Error(`Expected array at depth ${depth}`);
			}
			currentToken = scanner.scan();
			let idx = 0;
			let lastEnd = scanner.getTokenOffset();

			while (currentToken !== "CloseBracket" && currentToken !== "EOF") {
				if (idx > 0 && currentToken === "Comma") {
					currentToken = scanner.scan();
				}
				if (idx === segment) {
					if (depth === path.length) {
						const valueStart = scanner.getTokenOffset();
						skipValue();
						const valueEnd = scanner.getTokenOffset();

						if (value === undefined) {
							// Remove element
							let removeEnd = valueEnd;
							// Check for trailing comma
							const after = text.substring(removeEnd).trimStart();
							if (after.startsWith(",")) {
								removeEnd = text.indexOf(",", removeEnd) + 1;
							}
							return [{ offset: valueStart, length: removeEnd - valueStart, content: "" }];
						}
						const serialized = JSON.stringify(value, null, opts.tabSize);
						return [{ offset: valueStart, length: valueEnd - valueStart, content: serialized }];
					}
					break;
				}
				skipValue();
				lastEnd = scanner.getTokenOffset();
				idx++;
			}

			if (idx <= (segment as number) && depth === path.length && value !== undefined) {
				// Insert at end of array
				const indent = indentUnit.repeat(depth);
				const serialized = JSON.stringify(value, null, opts.tabSize);
				const insertText =
					idx === 0
						? `${opts.eol}${indent}${serialized}${opts.eol}${indentUnit.repeat(depth - 1)}`
						: `,${opts.eol}${indent}${serialized}`;
				return [{ offset: lastEnd, length: 0, content: insertText }];
			}
		}
	}

	return [];
}
