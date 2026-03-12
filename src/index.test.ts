import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import { JsoncModificationError, JsoncNodeNotFoundError, JsoncParseError, JsoncParseErrorDetail } from "./errors.js";
import { parse, parseTree, stripComments } from "./parse.js";
import { createScanner } from "./scanner.js";
import { JsoncEdit, JsoncFormattingOptions, JsoncParseOptions, JsoncRange } from "./schemas.js";

// ============================================================
// Error Tests
// ============================================================

describe("Error types", () => {
	it("JsoncParseError has correct _tag", () => {
		const detail = new JsoncParseErrorDetail({
			code: "InvalidSymbol",
			message: "test error",
			offset: 0,
			length: 1,
			startLine: 0,
			startCharacter: 0,
		});
		const error = new JsoncParseError({
			errors: [detail],
			text: "bad",
		});
		expect(error._tag).toBe("JsoncParseError");
		expect(error.message).toBe("JSONC parse failed with 1 error: test error");
	});

	it("JsoncParseError pluralizes correctly", () => {
		const details = [
			new JsoncParseErrorDetail({
				code: "InvalidSymbol",
				message: "err1",
				offset: 0,
				length: 1,
				startLine: 0,
				startCharacter: 0,
			}),
			new JsoncParseErrorDetail({
				code: "ValueExpected",
				message: "err2",
				offset: 5,
				length: 1,
				startLine: 0,
				startCharacter: 5,
			}),
		];
		const error = new JsoncParseError({ errors: details, text: "bad" });
		expect(error.message).toBe("JSONC parse failed with 2 errors: err1; err2");
	});

	it("JsoncNodeNotFoundError has correct _tag and message", () => {
		const error = new JsoncNodeNotFoundError({
			path: ["foo", 0, "bar"],
			rootNodeType: "object",
		});
		expect(error._tag).toBe("JsoncNodeNotFoundError");
		expect(error.message).toBe("Node not found at path [foo, 0, bar] in object node");
	});

	it("JsoncModificationError has correct _tag and message", () => {
		const error = new JsoncModificationError({
			path: ["key"],
			reason: "cannot modify root",
		});
		expect(error._tag).toBe("JsoncModificationError");
		expect(error.message).toBe("Modification failed at path [key]: cannot modify root");
	});
});

// ============================================================
// Schema Tests
// ============================================================

describe("Schema definitions", () => {
	it("JsoncParseOptions has correct defaults", () => {
		const opts = new JsoncParseOptions({});
		expect(opts.disallowComments).toBe(false);
		expect(opts.allowTrailingComma).toBe(true);
		expect(opts.allowEmptyContent).toBe(false);
	});

	it("JsoncFormattingOptions has correct defaults", () => {
		const opts = new JsoncFormattingOptions({});
		expect(opts.tabSize).toBe(2);
		expect(opts.insertSpaces).toBe(true);
		expect(opts.eol).toBe("\n");
		expect(opts.insertFinalNewline).toBe(false);
		expect(opts.keepLines).toBe(false);
	});

	it("JsoncEdit constructs correctly", () => {
		const edit = new JsoncEdit({ offset: 10, length: 5, content: "hello" });
		expect(edit.offset).toBe(10);
		expect(edit.length).toBe(5);
		expect(edit.content).toBe("hello");
	});

	it("JsoncRange constructs correctly", () => {
		const range = new JsoncRange({ offset: 0, length: 100 });
		expect(range.offset).toBe(0);
		expect(range.length).toBe(100);
	});
});

// ============================================================
// Scanner Tests
// ============================================================

describe("Scanner", () => {
	function collectTokens(text: string, ignoreTrivia = true) {
		const scanner = createScanner(text, ignoreTrivia);
		const tokens: Array<{ kind: string; value: string }> = [];
		let kind = scanner.scan();
		while (kind !== "EOF") {
			tokens.push({ kind, value: scanner.getTokenValue() });
			kind = scanner.scan();
		}
		return tokens;
	}

	it("tokenizes simple JSON object", () => {
		const tokens = collectTokens('{ "key": 42 }');
		expect(tokens).toEqual([
			{ kind: "OpenBrace", value: "{" },
			{ kind: "String", value: "key" },
			{ kind: "Colon", value: ":" },
			{ kind: "Number", value: "42" },
			{ kind: "CloseBrace", value: "}" },
		]);
	});

	it("tokenizes array", () => {
		const tokens = collectTokens("[1, 2, 3]");
		expect(tokens).toEqual([
			{ kind: "OpenBracket", value: "[" },
			{ kind: "Number", value: "1" },
			{ kind: "Comma", value: "," },
			{ kind: "Number", value: "2" },
			{ kind: "Comma", value: "," },
			{ kind: "Number", value: "3" },
			{ kind: "CloseBracket", value: "]" },
		]);
	});

	it("tokenizes keywords", () => {
		const tokens = collectTokens("[true, false, null]");
		expect(tokens).toEqual([
			{ kind: "OpenBracket", value: "[" },
			{ kind: "True", value: "true" },
			{ kind: "Comma", value: "," },
			{ kind: "False", value: "false" },
			{ kind: "Comma", value: "," },
			{ kind: "Null", value: "null" },
			{ kind: "CloseBracket", value: "]" },
		]);
	});

	it("tokenizes string with escape sequences", () => {
		const tokens = collectTokens('"hello\\nworld\\t\\u0041"');
		expect(tokens).toEqual([{ kind: "String", value: "hello\nworld\tA" }]);
	});

	it("tokenizes numbers", () => {
		const tokens = collectTokens("[0, 123, -45, 1.5, 1e10, -2.5e-3]");
		const kinds = tokens.filter((t) => t.kind === "Number").map((t) => t.value);
		expect(kinds).toEqual(["0", "123", "-45", "1.5", "1e10", "-2.5e-3"]);
	});

	it("tokenizes line comments", () => {
		const tokens = collectTokens("// comment\n42", false);
		const kinds = tokens.map((t) => t.kind);
		expect(kinds).toContain("LineComment");
		expect(kinds).toContain("Number");
	});

	it("tokenizes block comments", () => {
		const tokens = collectTokens("/* block */42", false);
		const kinds = tokens.map((t) => t.kind);
		expect(kinds).toContain("BlockComment");
		expect(kinds).toContain("Number");
	});

	it("tracks line and character positions", () => {
		const scanner = createScanner('{\n  "key": 1\n}', true);
		scanner.scan(); // {
		scanner.scan(); // "key"
		expect(scanner.getTokenStartLine()).toBe(1);
		expect(scanner.getTokenStartCharacter()).toBe(2);
	});

	it("reports unterminated string error", () => {
		const scanner = createScanner('"unterminated', true);
		scanner.scan();
		expect(scanner.getTokenError()).toBe("UnexpectedEndOfString");
	});

	it("reports unterminated block comment error", () => {
		const scanner = createScanner("/* unterminated", false);
		scanner.scan();
		expect(scanner.getTokenError()).toBe("UnexpectedEndOfComment");
	});

	it("reports invalid escape character", () => {
		const scanner = createScanner('"\\x"', true);
		scanner.scan();
		expect(scanner.getTokenError()).toBe("InvalidEscapeCharacter");
	});
});

// ============================================================
// Parser Tests
// ============================================================

describe("parse", () => {
	it("parses simple object", async () => {
		const result = await Effect.runPromise(parse('{ "key": "value" }'));
		expect(result).toEqual({ key: "value" });
	});

	it("parses nested objects", async () => {
		const result = await Effect.runPromise(parse('{ "a": { "b": 1 } }'));
		expect(result).toEqual({ a: { b: 1 } });
	});

	it("parses arrays", async () => {
		const result = await Effect.runPromise(parse("[1, 2, 3]"));
		expect(result).toEqual([1, 2, 3]);
	});

	it("parses JSONC with line comments", async () => {
		const result = await Effect.runPromise(parse('{\n  // comment\n  "key": 42\n}'));
		expect(result).toEqual({ key: 42 });
	});

	it("parses JSONC with block comments", async () => {
		const result = await Effect.runPromise(parse('{ /* comment */ "key": true }'));
		expect(result).toEqual({ key: true });
	});

	it("parses JSONC with trailing comma", async () => {
		const result = await Effect.runPromise(parse('{ "a": 1, "b": 2, }'));
		expect(result).toEqual({ a: 1, b: 2 });
	});

	it("parses array with trailing comma", async () => {
		const result = await Effect.runPromise(parse("[1, 2, 3,]"));
		expect(result).toEqual([1, 2, 3]);
	});

	it("parses all value types", async () => {
		const result = await Effect.runPromise(
			parse('{ "s": "str", "n": 42, "b": true, "f": false, "z": null, "a": [1] }'),
		);
		expect(result).toEqual({ s: "str", n: 42, b: true, f: false, z: null, a: [1] });
	});

	it("fails on disallowed comments", async () => {
		const result = await Effect.runPromise(Effect.either(parse("// comment\n42", { disallowComments: true })));
		expect(result._tag).toBe("Left");
	});

	it("fails on trailing comma when disallowed", async () => {
		const result = await Effect.runPromise(Effect.either(parse("[1, 2,]", { allowTrailingComma: false })));
		expect(result._tag).toBe("Left");
	});

	it("fails on empty content by default", async () => {
		const result = await Effect.runPromise(Effect.either(parse("")));
		expect(result._tag).toBe("Left");
	});

	it("allows empty content when configured", async () => {
		const result = await Effect.runPromise(parse("", { allowEmptyContent: true }));
		expect(result).toBeUndefined();
	});

	it("error has correct _tag for catchTag", async () => {
		const result = await Effect.runPromise(
			parse("invalid").pipe(Effect.catchTag("JsoncParseError", (e) => Effect.succeed(e._tag))),
		);
		expect(result).toBe("JsoncParseError");
	});
});

// ============================================================
// parseTree Tests
// ============================================================

describe("parseTree", () => {
	it("returns Option.some for valid JSONC", async () => {
		const result = await Effect.runPromise(parseTree('{ "key": 42 }'));
		expect(Option.isSome(result)).toBe(true);
		if (Option.isSome(result)) {
			expect(result.value.type).toBe("object");
		}
	});

	it("returns Option.none for empty content", async () => {
		const result = await Effect.runPromise(parseTree("", { allowEmptyContent: true }));
		expect(Option.isNone(result)).toBe(true);
	});

	it("AST has correct structure for object", async () => {
		const result = await Effect.runPromise(parseTree('{ "key": 42 }'));
		expect(Option.isSome(result)).toBe(true);
		if (Option.isSome(result)) {
			const root = result.value;
			expect(root.type).toBe("object");
			const children = root.children ?? [];
			expect(children).toHaveLength(1);
			const prop = children[0];
			expect(prop.type).toBe("property");
			const propChildren = prop.children ?? [];
			expect(propChildren).toHaveLength(2);
			expect(propChildren[0].type).toBe("string");
			expect(propChildren[0].value).toBe("key");
			expect(propChildren[1].type).toBe("number");
			expect(propChildren[1].value).toBe(42);
		}
	});

	it("AST has correct structure for array", async () => {
		const result = await Effect.runPromise(parseTree("[1, 2, 3]"));
		expect(Option.isSome(result)).toBe(true);
		if (Option.isSome(result)) {
			const root = result.value;
			expect(root.type).toBe("array");
			const children = root.children ?? [];
			expect(children).toHaveLength(3);
			expect(children[0].value).toBe(1);
			expect(children[1].value).toBe(2);
			expect(children[2].value).toBe(3);
		}
	});

	it("AST nodes have offset and length", async () => {
		const result = await Effect.runPromise(parseTree("42"));
		expect(Option.isSome(result)).toBe(true);
		if (Option.isSome(result)) {
			expect(result.value.offset).toBe(0);
			expect(result.value.length).toBeGreaterThan(0);
		}
	});
});

// ============================================================
// stripComments Tests
// ============================================================

describe("stripComments", () => {
	it("removes line comments", async () => {
		const result = await Effect.runPromise(stripComments("// comment\n42"));
		expect(result).toBe("\n42");
	});

	it("removes block comments", async () => {
		const result = await Effect.runPromise(stripComments("/* comment */42"));
		expect(result).toBe("42");
	});

	it("preserves offsets with replacement character", async () => {
		const result = await Effect.runPromise(stripComments("/* x */42", " "));
		expect(result).toBe("       42");
		expect(result.length).toBe("/* x */42".length);
	});

	it("handles multiple comments", async () => {
		const result = await Effect.runPromise(stripComments('{ // line\n  "key": /* block */ 42 }'));
		expect(result).toContain('"key":');
		expect(result).toContain("42");
		expect(result).not.toContain("//");
		expect(result).not.toContain("/*");
	});

	it("returns unchanged text with no comments", async () => {
		const input = '{ "key": 42 }';
		const result = await Effect.runPromise(stripComments(input));
		expect(result).toBe(input);
	});
});
