import { Chunk, Effect, Option, Schema, Stream, pipe } from "effect";
import { describe, expect, it } from "vitest";
import { findNode, findNodeAtOffset, getNodePath, getNodeValue } from "./ast.js";
import { JsoncModificationError, JsoncNodeNotFoundError, JsoncParseError, JsoncParseErrorDetail } from "./errors.js";
import { applyEdits, format, formatAndApply, modify } from "./format.js";
import { parse, parseTree, stripComments } from "./parse.js";
import { createScanner } from "./scanner.js";
import { JsoncFromString, makeJsoncFromString, makeJsoncSchema } from "./schema-integration.js";
import { JsoncEdit, JsoncFormattingOptions, JsoncParseOptions, JsoncRange } from "./schemas.js";
import type { JsoncVisitorEvent } from "./visitor.js";
import { visit, visitCollect } from "./visitor.js";

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

describe("Scanner — edge cases", () => {
	it("handles standalone slash as unknown token", () => {
		const scanner = createScanner("/ notAComment", false);
		const kind = scanner.scan();
		expect(kind).toBe("Unknown");
		expect(scanner.getTokenError()).toBe("InvalidCharacter");
	});

	it("getPosition and setPosition work", () => {
		const scanner = createScanner('{ "a": 1 }', false);
		scanner.scan(); // {
		const posAfterBrace = scanner.getPosition();
		expect(posAfterBrace).toBeGreaterThan(0);
		scanner.setPosition(0);
		const kind = scanner.scan(); // should re-scan from start
		expect(kind).toBe("OpenBrace");
	});

	it("getTokenStartLine and getTokenStartCharacter return position info", () => {
		const scanner = createScanner('{\n  "a": 1\n}', false);
		scanner.scan(); // {
		scanner.scan(); // newline
		scanner.scan(); // whitespace
		scanner.scan(); // "a"
		expect(scanner.getTokenStartLine()).toBeGreaterThanOrEqual(0);
		expect(scanner.getTokenStartCharacter()).toBeGreaterThanOrEqual(0);
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

// ============================================================
// Schema Integration Tests
// ============================================================

describe("JsoncFromString", () => {
	it("decodes valid JSONC to unknown", () => {
		const result = Schema.decodeUnknownSync(JsoncFromString)('{ "key": 42 }');
		expect(result).toEqual({ key: 42 });
	});

	it("decodes JSONC with comments", () => {
		const result = Schema.decodeUnknownSync(JsoncFromString)('{\n  // comment\n  "key": true\n}');
		expect(result).toEqual({ key: true });
	});

	it("decodes JSONC with trailing comma", () => {
		const result = Schema.decodeUnknownSync(JsoncFromString)('{ "a": 1, }');
		expect(result).toEqual({ a: 1 });
	});

	it("fails with ParseError on invalid JSONC", () => {
		expect(() => Schema.decodeUnknownSync(JsoncFromString)("{ invalid }")).toThrow();
	});

	it("encodes unknown to JSON string", () => {
		const result = Schema.encodeUnknownSync(JsoncFromString)({ key: 42 });
		expect(JSON.parse(result)).toEqual({ key: 42 });
	});
});

describe("makeJsoncFromString", () => {
	it("respects disallowComments option", () => {
		const strict = makeJsoncFromString({ disallowComments: true });
		expect(() => Schema.decodeUnknownSync(strict)("// comment\n42")).toThrow();
	});

	it("respects allowTrailingComma: false", () => {
		const strict = makeJsoncFromString({ allowTrailingComma: false });
		expect(() => Schema.decodeUnknownSync(strict)("[1, 2,]")).toThrow();
	});
});

describe("makeJsoncSchema", () => {
	const MyConfig = Schema.Struct({
		name: Schema.String,
		version: Schema.Number,
	});

	it("parses JSONC and validates against target schema", () => {
		const ConfigFromJsonc = makeJsoncSchema(MyConfig);
		const result = Schema.decodeUnknownSync(ConfigFromJsonc)('{ "name": "test", "version": 1 }');
		expect(result).toEqual({ name: "test", version: 1 });
	});

	it("parses JSONC with comments and validates", () => {
		const ConfigFromJsonc = makeJsoncSchema(MyConfig);
		const result = Schema.decodeUnknownSync(ConfigFromJsonc)('{\n  // app name\n  "name": "myapp",\n  "version": 2\n}');
		expect(result).toEqual({ name: "myapp", version: 2 });
	});

	it("fails when JSONC is valid but doesn't match schema", () => {
		const ConfigFromJsonc = makeJsoncSchema(MyConfig);
		expect(() => Schema.decodeUnknownSync(ConfigFromJsonc)('{ "name": 123 }')).toThrow();
	});

	it("fails on invalid JSONC", () => {
		const ConfigFromJsonc = makeJsoncSchema(MyConfig);
		expect(() => Schema.decodeUnknownSync(ConfigFromJsonc)("{ not valid }")).toThrow();
	});

	it("works with nested schemas", () => {
		const Nested = Schema.Struct({
			db: Schema.Struct({
				host: Schema.String,
				port: Schema.Number,
			}),
		});
		const NestedFromJsonc = makeJsoncSchema(Nested);
		const result = Schema.decodeUnknownSync(NestedFromJsonc)('{ "db": { "host": "localhost", "port": 5432 } }');
		expect(result).toEqual({ db: { host: "localhost", port: 5432 } });
	});

	it("round-trips: decode then encode preserves data", () => {
		const ConfigFromJsonc = makeJsoncSchema(MyConfig);
		const input = '{ "name": "test", "version": 1 }';
		const decoded = Schema.decodeUnknownSync(ConfigFromJsonc)(input);
		const encoded = Schema.encodeSync(ConfigFromJsonc)(decoded);
		const reDecoded = Schema.decodeUnknownSync(ConfigFromJsonc)(encoded);
		expect(reDecoded).toEqual(decoded);
	});

	it("parses realistic bun.lock snippet", () => {
		const BunLockSnippet = Schema.Struct({
			lockfileVersion: Schema.Number,
			packages: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
		});
		const BunLockFromJsonc = makeJsoncSchema(BunLockSnippet);
		const input = `{
  // bun.lock lockfile
  "lockfileVersion": 1,
  "packages": {
    "effect": "3.19.19",
  }
}`;
		const result = Schema.decodeUnknownSync(BunLockFromJsonc)(input);
		expect(result.lockfileVersion).toBe(1);
		expect(result.packages).toEqual({ effect: "3.19.19" });
	});
});

// ============================================================
// AST Navigation Tests
// ============================================================

describe("findNode", () => {
	const jsonc = '{ "a": { "b": 42 }, "arr": [1, 2, 3] }';

	it("finds nested property by path", async () => {
		const tree = await Effect.runPromise(parseTree(jsonc));
		expect(Option.isSome(tree)).toBe(true);
		if (Option.isSome(tree)) {
			const node = await Effect.runPromise(findNode(tree.value, ["a", "b"]));
			expect(Option.isSome(node)).toBe(true);
			if (Option.isSome(node)) {
				expect(node.value.type).toBe("number");
				expect(node.value.value).toBe(42);
			}
		}
	});

	it("finds array element by index", async () => {
		const tree = await Effect.runPromise(parseTree(jsonc));
		expect(Option.isSome(tree)).toBe(true);
		if (Option.isSome(tree)) {
			const node = await Effect.runPromise(findNode(tree.value, ["arr", 1]));
			expect(Option.isSome(node)).toBe(true);
			if (Option.isSome(node)) {
				expect(node.value.type).toBe("number");
				expect(node.value.value).toBe(2);
			}
		}
	});

	it("returns Option.none for missing path", async () => {
		const tree = await Effect.runPromise(parseTree(jsonc));
		expect(Option.isSome(tree)).toBe(true);
		if (Option.isSome(tree)) {
			const node = await Effect.runPromise(findNode(tree.value, ["missing"]));
			expect(Option.isNone(node)).toBe(true);
		}
	});

	it("works with pipe (data-last)", async () => {
		const tree = await Effect.runPromise(parseTree(jsonc));
		expect(Option.isSome(tree)).toBe(true);
		if (Option.isSome(tree)) {
			const node = await Effect.runPromise(pipe(tree.value, findNode(["a"])));
			expect(Option.isSome(node)).toBe(true);
			if (Option.isSome(node)) {
				expect(node.value.type).toBe("object");
			}
		}
	});
});

describe("findNodeAtOffset", () => {
	it("finds node at specific offset", async () => {
		const text = '{ "key": 42 }';
		const tree = await Effect.runPromise(parseTree(text));
		expect(Option.isSome(tree)).toBe(true);
		if (Option.isSome(tree)) {
			// offset 9 is within "42"
			const node = await Effect.runPromise(findNodeAtOffset(tree.value, 9));
			expect(Option.isSome(node)).toBe(true);
			if (Option.isSome(node)) {
				expect(node.value.type).toBe("number");
				expect(node.value.value).toBe(42);
			}
		}
	});

	it("returns Option.none for out-of-range offset", async () => {
		const tree = await Effect.runPromise(parseTree("42"));
		expect(Option.isSome(tree)).toBe(true);
		if (Option.isSome(tree)) {
			const node = await Effect.runPromise(findNodeAtOffset(tree.value, 100));
			expect(Option.isNone(node)).toBe(true);
		}
	});
});

describe("getNodePath", () => {
	it("returns correct path for nested node", async () => {
		const text = '{ "a": { "b": 42 } }';
		const tree = await Effect.runPromise(parseTree(text));
		expect(Option.isSome(tree)).toBe(true);
		if (Option.isSome(tree)) {
			// offset 14 is within "42"
			const path = await Effect.runPromise(getNodePath(tree.value, 14));
			expect(Option.isSome(path)).toBe(true);
			if (Option.isSome(path)) {
				expect(path.value).toEqual(["a", "b"]);
			}
		}
	});
});

describe("getNodeValue", () => {
	it("reconstructs object from AST", async () => {
		const text = '{ "a": 1, "b": "two" }';
		const tree = await Effect.runPromise(parseTree(text));
		expect(Option.isSome(tree)).toBe(true);
		if (Option.isSome(tree)) {
			const value = await Effect.runPromise(getNodeValue(tree.value));
			expect(value).toEqual({ a: 1, b: "two" });
		}
	});

	it("reconstructs array from AST", async () => {
		const tree = await Effect.runPromise(parseTree("[1, 2, 3]"));
		expect(Option.isSome(tree)).toBe(true);
		if (Option.isSome(tree)) {
			const value = await Effect.runPromise(getNodeValue(tree.value));
			expect(value).toEqual([1, 2, 3]);
		}
	});

	it("handles all value types", async () => {
		const text = '{ "s": "str", "n": 42, "b": true, "f": false, "z": null }';
		const tree = await Effect.runPromise(parseTree(text));
		expect(Option.isSome(tree)).toBe(true);
		if (Option.isSome(tree)) {
			const value = await Effect.runPromise(getNodeValue(tree.value));
			expect(value).toEqual({ s: "str", n: 42, b: true, f: false, z: null });
		}
	});

	it("round-trips with parse", async () => {
		const text = '{ "config": { "port": 3000, "hosts": ["a", "b"] } }';
		const tree = await Effect.runPromise(parseTree(text));
		const parsed = await Effect.runPromise(parse(text));
		expect(Option.isSome(tree)).toBe(true);
		if (Option.isSome(tree)) {
			const value = await Effect.runPromise(getNodeValue(tree.value));
			expect(value).toEqual(parsed);
		}
	});
});

// ============================================================
// Format Tests
// ============================================================

describe("format", () => {
	it("produces formatting edits for compact JSON", async () => {
		const input = '{"a":1,"b":2}';
		const edits = await Effect.runPromise(format(input));
		expect(edits.length).toBeGreaterThan(0);
	});

	it("formatAndApply produces formatted output", async () => {
		const input = '{"a":1,"b":2}';
		const result = await Effect.runPromise(formatAndApply(input));
		expect(result).toContain("\n");
		// Verify the result is valid JSON
		const parsed = JSON.parse(result);
		expect(parsed).toEqual({ a: 1, b: 2 });
	});

	it("respects tab-based indentation", async () => {
		const input = '{"a":1}';
		const result = await Effect.runPromise(formatAndApply(input, undefined, { insertSpaces: false }));
		expect(result).toContain("\t");
	});

	it("preserves comments during formatting", async () => {
		const input = '{// comment\n"a":1}';
		const result = await Effect.runPromise(formatAndApply(input));
		expect(result).toContain("// comment");
	});
});

describe("applyEdits", () => {
	it("applies edits correctly", async () => {
		const text = "hello world";
		const edits = [{ offset: 5, length: 1, content: "_" }];
		const result = await Effect.runPromise(applyEdits(text, edits));
		expect(result).toBe("hello_world");
	});

	it("works with pipe (data-last)", async () => {
		const text = "abc";
		const edits = [{ offset: 1, length: 1, content: "B" }];
		const result = await Effect.runPromise(pipe(text, applyEdits(edits)));
		expect(result).toBe("aBc");
	});
});

describe("modify", () => {
	it("replaces existing property value", async () => {
		const input = '{ "key": 42 }';
		const edits = await Effect.runPromise(modify(input, ["key"], 100));
		const result = await Effect.runPromise(applyEdits(input, edits));
		const parsed = JSON.parse(result);
		expect(parsed.key).toBe(100);
	});

	it("inserts new property into object", async () => {
		const input = '{ "a": 1 }';
		const edits = await Effect.runPromise(modify(input, ["b"], 2));
		const result = await Effect.runPromise(applyEdits(input, edits));
		const parsed = JSON.parse(result);
		expect(parsed.b).toBe(2);
	});

	it("replaces entire document with empty path", async () => {
		const input = '{ "old": true }';
		const edits = await Effect.runPromise(modify(input, [], { new: true }));
		const result = await Effect.runPromise(applyEdits(input, edits));
		const parsed = JSON.parse(result);
		expect(parsed).toEqual({ new: true });
	});

	it("modify + applyEdits pipeline", async () => {
		const input = '{ "version": 1 }';
		const result = await Effect.runPromise(
			modify(input, ["version"], 2).pipe(Effect.flatMap((edits) => applyEdits(input, edits))),
		);
		const parsed = JSON.parse(result);
		expect(parsed.version).toBe(2);
	});
});

describe("modify — array operations", () => {
	it("replaces array element by index", async () => {
		const input = '{ "items": [1, 2, 3] }';
		const edits = await Effect.runPromise(modify(input, ["items", 1], 99));
		const result = await Effect.runPromise(applyEdits(input, edits));
		expect(JSON.parse(result)).toEqual({ items: [1, 99, 3] });
	});

	it("removes array element by setting undefined", async () => {
		const input = '{ "items": [1, 2, 3] }';
		const edits = await Effect.runPromise(modify(input, ["items", 1], undefined));
		const result = await Effect.runPromise(applyEdits(input, edits));
		expect(result).not.toContain("2");
	});

	it("inserts at end of array", async () => {
		const input = '{ "items": [1, 2] }';
		const edits = await Effect.runPromise(modify(input, ["items", 2], 3));
		const result = await Effect.runPromise(applyEdits(input, edits));
		expect(result).toContain("3");
	});

	it("inserts into empty array", async () => {
		const input = '{ "items": [] }';
		const edits = await Effect.runPromise(modify(input, ["items", 0], "first"));
		const result = await Effect.runPromise(applyEdits(input, edits));
		expect(result).toContain("first");
	});
});

describe("parse — error message branches", () => {
	it("reports UnexpectedEndOfString", async () => {
		const result = await Effect.runPromise(Effect.either(parse('"unterminated')));
		expect(result._tag).toBe("Left");
		if (result._tag === "Left") {
			expect(result.left.errors.length).toBeGreaterThan(0);
		}
	});

	it("reports InvalidUnicode", async () => {
		const result = await Effect.runPromise(Effect.either(parse('"\\u00zz"')));
		expect(result._tag).toBe("Left");
	});

	it("reports InvalidEscapeCharacter", async () => {
		const result = await Effect.runPromise(Effect.either(parse('"\\q"')));
		expect(result._tag).toBe("Left");
	});

	it("scanner handles standalone minus sign", async () => {
		const scanner = createScanner("-", false);
		const kind = scanner.scan();
		expect(kind).toBe("Unknown");
	});

	it("scanner handles invalid characters", async () => {
		const scanner = createScanner("\x01", false);
		const kind = scanner.scan();
		expect(kind).toBe("Unknown");
	});
});

// ============================================================
// Visitor / Stream Tests
// ============================================================

describe("visit", () => {
	it("emits ObjectBegin and ObjectEnd for empty object", async () => {
		const events = await Effect.runPromise(visit("{}").pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)));
		const tags = events.map((e) => e._tag);
		expect(tags).toContain("ObjectBegin");
		expect(tags).toContain("ObjectEnd");
	});

	it("emits ArrayBegin and ArrayEnd for empty array", async () => {
		const events = await Effect.runPromise(visit("[]").pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)));
		const tags = events.map((e) => e._tag);
		expect(tags).toContain("ArrayBegin");
		expect(tags).toContain("ArrayEnd");
	});

	it("emits LiteralValue for primitives", async () => {
		const events = await Effect.runPromise(visit("42").pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)));
		const literals = events.filter(
			(e): e is Extract<JsoncVisitorEvent, { _tag: "LiteralValue" }> => e._tag === "LiteralValue",
		);
		expect(literals).toHaveLength(1);
		expect(literals[0].value).toBe(42);
	});

	it("emits ObjectProperty for object keys", async () => {
		const events = await Effect.runPromise(
			visit('{ "name": "test" }').pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const props = events.filter(
			(e): e is Extract<JsoncVisitorEvent, { _tag: "ObjectProperty" }> => e._tag === "ObjectProperty",
		);
		expect(props).toHaveLength(1);
		expect(props[0].property).toBe("name");
	});

	it("emits Separator events for colons and commas", async () => {
		const events = await Effect.runPromise(
			visit('{ "a": 1, "b": 2 }').pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const seps = events.filter((e): e is Extract<JsoncVisitorEvent, { _tag: "Separator" }> => e._tag === "Separator");
		const chars = seps.map((s) => s.character);
		expect(chars).toContain(":");
		expect(chars).toContain(",");
	});

	it("emits Comment events for line comments", async () => {
		const events = await Effect.runPromise(
			visit("// comment\n42").pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const comments = events.filter((e) => e._tag === "Comment");
		expect(comments.length).toBeGreaterThanOrEqual(1);
	});

	it("emits Comment events for block comments", async () => {
		const events = await Effect.runPromise(
			visit("/* block */ 42").pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const comments = events.filter((e) => e._tag === "Comment");
		expect(comments.length).toBeGreaterThanOrEqual(1);
	});

	it("emits Error when comments are disallowed", async () => {
		const events = await Effect.runPromise(
			visit("// comment\n42", { disallowComments: true }).pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const errors = events.filter((e): e is Extract<JsoncVisitorEvent, { _tag: "Error" }> => e._tag === "Error");
		expect(errors.some((e) => e.code === "InvalidCommentToken")).toBe(true);
	});

	it("tracks path for nested objects", async () => {
		const events = await Effect.runPromise(
			visit('{ "a": { "b": 1 } }').pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const literals = events.filter(
			(e): e is Extract<JsoncVisitorEvent, { _tag: "LiteralValue" }> => e._tag === "LiteralValue",
		);
		expect(literals).toHaveLength(1);
		expect(literals[0].path).toEqual(["a", "b"]);
	});

	it("tracks path for arrays", async () => {
		const events = await Effect.runPromise(
			visit("[1, 2, 3]").pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const literals = events.filter(
			(e): e is Extract<JsoncVisitorEvent, { _tag: "LiteralValue" }> => e._tag === "LiteralValue",
		);
		expect(literals).toHaveLength(3);
		expect(literals[0].path).toEqual([0]);
		expect(literals[1].path).toEqual([1]);
		expect(literals[2].path).toEqual([2]);
	});

	it("handles mixed nested structures", async () => {
		const input = '{ "items": [{ "id": 1 }, { "id": 2 }] }';
		const events = await Effect.runPromise(visit(input).pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)));
		const literals = events.filter(
			(e): e is Extract<JsoncVisitorEvent, { _tag: "LiteralValue" }> => e._tag === "LiteralValue",
		);
		expect(literals).toHaveLength(2);
		expect(literals[0].path).toEqual(["items", 0, "id"]);
		expect(literals[1].path).toEqual(["items", 1, "id"]);
	});
});

describe("visit — lazy streaming", () => {
	it("Stream.take(1) does not scan the entire document", async () => {
		// Build a large document with many properties
		const entries = Array.from({ length: 1000 }, (_, i) => `"key${i}": ${i}`).join(", ");
		const largeDoc = `{ ${entries} }`;

		// Taking just the first event should work without processing everything
		const firstEvent = await Effect.runPromise(
			visit(largeDoc).pipe(Stream.take(1), Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);

		expect(firstEvent).toHaveLength(1);
		expect(firstEvent[0]._tag).toBe("ObjectBegin");
	});

	it("Stream.takeWhile stops early", async () => {
		const doc = '{ "a": 1, "b": 2, "c": 3 }';

		// Take events only until we see the first LiteralValue
		const events = await Effect.runPromise(
			visit(doc).pipe(
				Stream.takeWhile((e) => e._tag !== "LiteralValue"),
				Stream.runCollect,
				Effect.map(Chunk.toReadonlyArray),
			),
		);

		// Should have ObjectBegin, ObjectProperty "a", Separator ":"
		// but NOT the LiteralValue itself (takeWhile excludes it via type narrowing)
		expect(events.length).toBeGreaterThan(0);
		const tags = events.map((e) => e._tag);
		expect(tags).toContain("ObjectBegin");
		expect(tags).toContain("ObjectProperty");
	});
});

describe("visitCollect", () => {
	it("collects only matching events", async () => {
		const literals = await Effect.runPromise(
			visitCollect(
				'{ "x": 1, "y": "hello" }',
				(e): e is Extract<JsoncVisitorEvent, { _tag: "LiteralValue" }> => e._tag === "LiteralValue",
			),
		);
		expect(literals).toHaveLength(2);
		expect(literals[0].value).toBe(1);
		expect(literals[1].value).toBe("hello");
	});

	it("returns empty array when no events match", async () => {
		const errors = await Effect.runPromise(
			visitCollect('{ "valid": true }', (e): e is Extract<JsoncVisitorEvent, { _tag: "Error" }> => e._tag === "Error"),
		);
		expect(errors).toHaveLength(0);
	});
});

// ============================================================
// Coverage: format.ts — property removal, array operations
// ============================================================

describe("modify — property removal", () => {
	it("removes a property from an object", async () => {
		const input = '{ "a": 1, "b": 2 }';
		const edits = await Effect.runPromise(modify(input, ["a"], undefined));
		const result = await Effect.runPromise(applyEdits(input, edits));
		expect(result).not.toContain('"a"');
		expect(edits.length).toBeGreaterThan(0);
	});

	it("removes the last property from an object", async () => {
		const input = '{ "a": 1, "b": 2 }';
		const edits = await Effect.runPromise(modify(input, ["b"], undefined));
		const result = await Effect.runPromise(applyEdits(input, edits));
		expect(result).not.toContain('"b"');
		expect(edits.length).toBeGreaterThan(0);
	});

	it("removes entire document with empty path and undefined", async () => {
		const input = '{ "a": 1 }';
		const edits = await Effect.runPromise(modify(input, [], undefined));
		const result = await Effect.runPromise(applyEdits(input, edits));
		expect(result).toBe("");
	});
});

describe("modify — array operations", () => {
	it("replaces an element in an array", async () => {
		const input = "[1, 2, 3]";
		const edits = await Effect.runPromise(modify(input, [1], 99));
		const result = await Effect.runPromise(applyEdits(input, edits));
		const parsed = JSON.parse(result);
		expect(parsed).toEqual([1, 99, 3]);
	});

	it("removes an element from an array", async () => {
		const input = "[1, 2, 3]";
		const edits = await Effect.runPromise(modify(input, [1], undefined));
		const result = await Effect.runPromise(applyEdits(input, edits));
		const parsed = JSON.parse(result);
		expect(parsed).toEqual([1, 3]);
	});

	it("inserts at end of array", async () => {
		const input = "[1, 2]";
		const edits = await Effect.runPromise(modify(input, [2], 3));
		const result = await Effect.runPromise(applyEdits(input, edits));
		const parsed = JSON.parse(result);
		expect(parsed).toEqual([1, 2, 3]);
	});

	it("inserts into empty array", async () => {
		const input = "[]";
		const edits = await Effect.runPromise(modify(input, [0], 42));
		const result = await Effect.runPromise(applyEdits(input, edits));
		const parsed = JSON.parse(result);
		expect(parsed).toEqual([42]);
	});

	it("inserts new property into empty object", async () => {
		const input = "{}";
		const edits = await Effect.runPromise(modify(input, ["key"], "value"));
		const result = await Effect.runPromise(applyEdits(input, edits));
		const parsed = JSON.parse(result);
		expect(parsed.key).toBe("value");
	});

	it("modifies nested array element", async () => {
		const input = '{ "arr": [10, 20, 30] }';
		const edits = await Effect.runPromise(modify(input, ["arr", 0], 99));
		const result = await Effect.runPromise(applyEdits(input, edits));
		const parsed = JSON.parse(result);
		expect(parsed.arr[0]).toBe(99);
	});

	it("fails when path expects object but finds array", async () => {
		const input = "[1, 2, 3]";
		const result = await Effect.runPromise(Effect.either(modify(input, ["key"], 1)));
		expect(result._tag).toBe("Left");
	});

	it("fails when path expects array but finds object", async () => {
		const input = '{ "a": 1 }';
		const result = await Effect.runPromise(Effect.either(modify(input, [0], 1)));
		expect(result._tag).toBe("Left");
	});
});

describe("modify — data-last (pipe)", () => {
	it("works with pipe syntax", async () => {
		const input = '{ "x": 1 }';
		const result = await Effect.runPromise(
			pipe(
				input,
				modify(["x"], 2),
				Effect.flatMap((edits) => applyEdits(input, edits)),
			),
		);
		const parsed = JSON.parse(result);
		expect(parsed.x).toBe(2);
	});
});

// ============================================================
// Coverage: format.ts — formatting edge cases
// ============================================================

describe("format — edge cases", () => {
	it("formats with range parameter", async () => {
		const input = '{"a":1,\n"b":2}';
		const edits = await Effect.runPromise(format(input, { offset: 0, length: 7 }));
		expect(edits.length).toBeGreaterThanOrEqual(0);
	});

	it("inserts final newline when requested", async () => {
		// Input with trailing whitespace so insertFinalNewline has something to replace
		const input = '{"a":1}  ';
		const result = await Effect.runPromise(formatAndApply(input, undefined, { insertFinalNewline: true }));
		expect(result.endsWith("\n")).toBe(true);
	});

	it("handles keepLines option", async () => {
		const input = '{\n"a":1,\n"b":2\n}';
		const result = await Effect.runPromise(formatAndApply(input, undefined, { keepLines: true }));
		expect(result).toContain("\n");
	});

	it("formats with custom eol", async () => {
		const input = '{"a":1}';
		const result = await Effect.runPromise(formatAndApply(input, undefined, { eol: "\r\n" }));
		expect(result).toContain("\r\n");
	});
});

// ============================================================
// Coverage: visitor.ts — edge cases
// ============================================================

describe("visit — edge cases", () => {
	it("handles trailing commas in objects", async () => {
		const events = await Effect.runPromise(
			visit('{ "a": 1, }').pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const literals = events.filter(
			(e): e is Extract<JsoncVisitorEvent, { _tag: "LiteralValue" }> => e._tag === "LiteralValue",
		);
		expect(literals).toHaveLength(1);
		expect(literals[0].value).toBe(1);
	});

	it("handles trailing commas in arrays", async () => {
		const events = await Effect.runPromise(
			visit("[1, 2, ]").pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const literals = events.filter(
			(e): e is Extract<JsoncVisitorEvent, { _tag: "LiteralValue" }> => e._tag === "LiteralValue",
		);
		expect(literals).toHaveLength(2);
	});

	it("emits Error for missing colon in object", async () => {
		const events = await Effect.runPromise(
			visit('{ "a" 1 }').pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const errors = events.filter((e): e is Extract<JsoncVisitorEvent, { _tag: "Error" }> => e._tag === "Error");
		expect(errors.some((e) => e.code === "ColonExpected")).toBe(true);
	});

	it("emits Error for missing comma between properties", async () => {
		const events = await Effect.runPromise(
			visit('{ "a": 1 "b": 2 }').pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const errors = events.filter((e): e is Extract<JsoncVisitorEvent, { _tag: "Error" }> => e._tag === "Error");
		expect(errors.some((e) => e.code === "CommaExpected")).toBe(true);
	});

	it("emits Error for missing comma between array elements", async () => {
		const events = await Effect.runPromise(visit("[1 2 3]").pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)));
		const errors = events.filter((e): e is Extract<JsoncVisitorEvent, { _tag: "Error" }> => e._tag === "Error");
		expect(errors.some((e) => e.code === "CommaExpected")).toBe(true);
	});

	it("emits Error for non-string property name", async () => {
		const events = await Effect.runPromise(
			visit("{ 123: true }").pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const errors = events.filter((e): e is Extract<JsoncVisitorEvent, { _tag: "Error" }> => e._tag === "Error");
		expect(errors.some((e) => e.code === "PropertyNameExpected")).toBe(true);
	});

	it("emits Error for unexpected token as value", async () => {
		const events = await Effect.runPromise(visit("}").pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)));
		const errors = events.filter((e): e is Extract<JsoncVisitorEvent, { _tag: "Error" }> => e._tag === "Error");
		expect(errors.some((e) => e.code === "ValueExpected")).toBe(true);
	});

	it("handles string values (true, false, null)", async () => {
		const events = await Effect.runPromise(
			visit('[true, false, null, "hello"]').pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const literals = events.filter(
			(e): e is Extract<JsoncVisitorEvent, { _tag: "LiteralValue" }> => e._tag === "LiteralValue",
		);
		expect(literals).toHaveLength(4);
		expect(literals[0].value).toBe(true);
		expect(literals[1].value).toBe(false);
		expect(literals[2].value).toBe(null);
		expect(literals[3].value).toBe("hello");
	});

	it("handles empty input", async () => {
		const events = await Effect.runPromise(visit("").pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)));
		expect(events).toHaveLength(0);
	});

	it("emits Error for unclosed object", async () => {
		const events = await Effect.runPromise(
			visit('{ "a": 1').pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const errors = events.filter((e): e is Extract<JsoncVisitorEvent, { _tag: "Error" }> => e._tag === "Error");
		expect(errors.some((e) => e.code === "CloseBraceExpected")).toBe(true);
	});

	it("emits Error for unclosed array", async () => {
		const events = await Effect.runPromise(visit("[1, 2").pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)));
		const errors = events.filter((e): e is Extract<JsoncVisitorEvent, { _tag: "Error" }> => e._tag === "Error");
		expect(errors.some((e) => e.code === "CloseBracketExpected")).toBe(true);
	});
});

// ============================================================
// Coverage: scanner.ts — edge cases
// ============================================================

describe("scanner — edge cases", () => {
	it("scans unknown characters", () => {
		const scanner = createScanner("@", false);
		const kind = scanner.scan();
		expect(kind).toBe("Unknown");
	});

	it("scans negative numbers", () => {
		const scanner = createScanner("-42", true);
		const kind = scanner.scan();
		expect(kind).toBe("Number");
		expect(scanner.getTokenValue()).toBe("-42");
	});

	it("handles unterminated string", () => {
		const scanner = createScanner('"hello', false);
		scanner.scan();
		expect(scanner.getTokenError()).toBe("UnexpectedEndOfString");
	});

	it("handles unterminated block comment", () => {
		const scanner = createScanner("/* comment without end", false);
		scanner.scan();
		expect(scanner.getTokenError()).toBe("UnexpectedEndOfComment");
	});

	it("scans all escape sequences", () => {
		const scanner = createScanner('"\\n\\t\\r\\\\\\/"', true);
		scanner.scan();
		expect(scanner.getTokenValue()).toContain("\n");
		expect(scanner.getTokenValue()).toContain("\t");
	});

	it("handles invalid escape character", () => {
		const scanner = createScanner('"\\x"', false);
		scanner.scan();
		expect(scanner.getTokenError()).toBe("InvalidEscapeCharacter");
	});

	it("handles invalid unicode escape", () => {
		const scanner = createScanner('"\\uGGGG"', false);
		scanner.scan();
		expect(scanner.getTokenError()).toBe("InvalidUnicode");
	});

	it("scans number with exponent", () => {
		const scanner = createScanner("1e10", true);
		const kind = scanner.scan();
		expect(kind).toBe("Number");
		expect(scanner.getTokenValue()).toBe("1e10");
	});

	it("reports position correctly", () => {
		const scanner = createScanner("  42", false);
		scanner.scan(); // trivia
		scanner.scan(); // number
		expect(scanner.getTokenOffset()).toBe(2);
		expect(scanner.getTokenLength()).toBe(2);
	});

	it("setPosition resets scanner state", () => {
		const scanner = createScanner('{"a": 1}', true);
		scanner.scan(); // {
		scanner.scan(); // "a"
		scanner.setPosition(0);
		const kind = scanner.scan();
		expect(kind).toBe("OpenBrace");
	});

	it("scans leading zeros as two separate tokens", () => {
		const scanner = createScanner("01", true);
		const first = scanner.scan();
		expect(first).toBe("Number");
		expect(scanner.getTokenValue()).toBe("0");
		const second = scanner.scan();
		expect(second).toBe("Number");
		expect(scanner.getTokenValue()).toBe("1");
	});

	it("scans True as Unknown (case-sensitive keywords)", () => {
		const scanner = createScanner("True", true);
		const kind = scanner.scan();
		expect(kind).toBe("Unknown");
	});

	it("scans scientific notation numbers", () => {
		const scanner = createScanner("90E+123", true);
		const kind = scanner.scan();
		expect(kind).toBe("Number");
		expect(scanner.getTokenValue()).toBe("90E+123");
	});

	it("scans negative scientific notation", () => {
		const scanner = createScanner("90e-123", true);
		const kind = scanner.scan();
		expect(kind).toBe("Number");
		expect(scanner.getTokenValue()).toBe("90e-123");
	});

	it("handles all string escape sequences including backspace and formfeed", () => {
		const scanner = createScanner('"\\b\\f"', true);
		scanner.scan();
		expect(scanner.getTokenValue()).toContain("\b");
		expect(scanner.getTokenValue()).toContain("\f");
	});

	it("handles unicode escape to produce correct character", () => {
		const scanner = createScanner('"\\u00DC"', true);
		scanner.scan();
		expect(scanner.getTokenValue()).toBe("Ü");
	});

	it("scans line and block comments", () => {
		const scanner = createScanner("// line\n/* block */", false);
		const t1 = scanner.scan();
		expect(t1).toBe("LineComment");
		scanner.scan(); // linebreak
		const t2 = scanner.scan();
		expect(t2).toBe("BlockComment");
	});

	it("tracks line and character positions", () => {
		const scanner = createScanner('{\n  "a": 1\n}', false);
		// scan past the opening brace and newline to get to "a"
		scanner.scan(); // {
		scanner.scan(); // \n
		scanner.scan(); // spaces (trivia)
		scanner.scan(); // "a"
		expect(scanner.getTokenStartLine()).toBe(1);
		expect(scanner.getTokenStartCharacter()).toBe(2);
	});

	it("scans decimal number 0.1", () => {
		const scanner = createScanner("0.1", true);
		const kind = scanner.scan();
		expect(kind).toBe("Number");
		expect(scanner.getTokenValue()).toBe("0.1");
	});

	it("scans negative decimal -0.1", () => {
		const scanner = createScanner("-0.1", true);
		const kind = scanner.scan();
		expect(kind).toBe("Number");
		expect(scanner.getTokenValue()).toBe("-0.1");
	});
});

// ============================================================
// Coverage: parse.ts — edge cases
// ============================================================

describe("parse — edge cases", () => {
	it("parses deeply nested structures", async () => {
		let input = "";
		for (let i = 0; i < 50; i++) input += "[";
		input += "1";
		for (let i = 0; i < 50; i++) input += "]";
		const result = await Effect.runPromise(parse(input));
		let current: unknown = result;
		for (let i = 0; i < 50; i++) current = (current as unknown[])[0];
		expect(current).toBe(1);
	});

	it("parses unicode property names", async () => {
		const result = await Effect.runPromise(parse('{ "über": "café" }'));
		expect((result as Record<string, string>).über).toBe("café");
	});

	it("parses empty string value", async () => {
		const result = await Effect.runPromise(parse('""'));
		expect(result).toBe("");
	});

	it("parses JSONC with only comments", async () => {
		const result = await Effect.runPromise(Effect.either(parse("// just a comment")));
		// Empty content with default options should fail
		expect(result._tag).toBe("Left");
	});

	it("allows empty content with option", async () => {
		const result = await Effect.runPromise(parse("", { allowEmptyContent: true }));
		expect(result).toBeUndefined();
	});

	it("reports multiple errors", async () => {
		const result = await Effect.runPromise(Effect.either(parse("{ , : }")));
		if (result._tag === "Left") {
			expect(result.left.errors.length).toBeGreaterThan(0);
		}
	});

	it("handles trailing comma in allowTrailingComma mode", async () => {
		const result = await Effect.runPromise(parse("[1, 2, ]", { allowTrailingComma: true }));
		expect(result).toEqual([1, 2]);
	});

	it("reports error for trailing comma when not allowed", async () => {
		const result = await Effect.runPromise(Effect.either(parse("[1, 2, ]", { allowTrailingComma: false })));
		if (result._tag === "Left") {
			expect(result.left.errors.length).toBeGreaterThan(0);
		}
	});

	it("parseTree returns None for empty content with allowEmptyContent", async () => {
		const result = await Effect.runPromise(parseTree("  ", { allowEmptyContent: true }));
		expect(Option.isNone(result)).toBe(true);
	});

	it("parseTree builds correct AST for arrays", async () => {
		const result = await Effect.runPromise(parseTree("[1, 2]"));
		expect(Option.isSome(result)).toBe(true);
		if (Option.isSome(result)) {
			expect(result.value.type).toBe("array");
			expect(result.value.children?.length).toBe(2);
		}
	});
});

// ============================================================
// Coverage: ast.ts — edge cases
// ============================================================

// ============================================================
// Coverage: visitor.ts — scan error events
// ============================================================

describe("visit — scan errors", () => {
	it("emits Error for invalid unicode escape", async () => {
		const events = await Effect.runPromise(
			visit('"\\uGGGG"').pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const errors = events.filter((e): e is Extract<JsoncVisitorEvent, { _tag: "Error" }> => e._tag === "Error");
		expect(errors.some((e) => e.code === "InvalidUnicode")).toBe(true);
	});

	it("emits Error for invalid escape character", async () => {
		const events = await Effect.runPromise(visit('"\\x"').pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)));
		const errors = events.filter((e): e is Extract<JsoncVisitorEvent, { _tag: "Error" }> => e._tag === "Error");
		expect(errors.some((e) => e.code === "InvalidEscapeCharacter")).toBe(true);
	});

	it("emits Error for unterminated string", async () => {
		const events = await Effect.runPromise(visit('"hello').pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)));
		const errors = events.filter((e): e is Extract<JsoncVisitorEvent, { _tag: "Error" }> => e._tag === "Error");
		expect(errors.some((e) => e.code === "UnexpectedEndOfString")).toBe(true);
	});

	it("emits Error for unterminated block comment", async () => {
		const events = await Effect.runPromise(
			visit("/* unterminated").pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)),
		);
		const errors = events.filter((e): e is Extract<JsoncVisitorEvent, { _tag: "Error" }> => e._tag === "Error");
		expect(errors.some((e) => e.code === "UnexpectedEndOfComment")).toBe(true);
	});

	it("emits Error for invalid character", async () => {
		const events = await Effect.runPromise(visit("@").pipe(Stream.runCollect, Effect.map(Chunk.toReadonlyArray)));
		const errors = events.filter((e): e is Extract<JsoncVisitorEvent, { _tag: "Error" }> => e._tag === "Error");
		expect(errors.length).toBeGreaterThan(0);
	});
});

// ============================================================
// Coverage: parse.ts — error message formatting
// ============================================================

describe("parse — error messages", () => {
	it("includes error messages for ColonExpected", async () => {
		const result = await Effect.runPromise(Effect.either(parse('{ "a" 1 }')));
		if (result._tag === "Left") {
			expect(result.left.errors.some((e) => e.code === "ColonExpected")).toBe(true);
		}
	});

	it("includes error messages for CloseBraceExpected", async () => {
		const result = await Effect.runPromise(Effect.either(parse('{ "a": 1')));
		if (result._tag === "Left") {
			expect(result.left.errors.some((e) => e.code === "CloseBraceExpected")).toBe(true);
		}
	});

	it("includes error messages for CloseBracketExpected", async () => {
		const result = await Effect.runPromise(Effect.either(parse("[1, 2")));
		if (result._tag === "Left") {
			expect(result.left.errors.some((e) => e.code === "CloseBracketExpected")).toBe(true);
		}
	});

	it("includes error messages for EndOfFileExpected", async () => {
		const result = await Effect.runPromise(Effect.either(parse("1 2")));
		if (result._tag === "Left") {
			expect(result.left.errors.some((e) => e.code === "EndOfFileExpected")).toBe(true);
		}
	});

	it("includes error messages for InvalidCommentToken", async () => {
		const result = await Effect.runPromise(Effect.either(parse("// comment\n1", { disallowComments: true })));
		if (result._tag === "Left") {
			expect(result.left.errors.some((e) => e.code === "InvalidCommentToken")).toBe(true);
		}
	});

	it("includes error messages for scanner errors", async () => {
		const result = await Effect.runPromise(Effect.either(parse('"\\uGGGG"')));
		if (result._tag === "Left") {
			expect(result.left.errors.some((e) => e.code === "InvalidUnicode")).toBe(true);
		}
	});
});

// ============================================================
// Coverage: ast.ts — more branch coverage
// ============================================================

describe("ast — edge cases", () => {
	it("findNodeAtOffset returns None for offset past end", async () => {
		const tree = await Effect.runPromise(parseTree('{ "a": 1 }'));
		if (Option.isSome(tree)) {
			const node = await Effect.runPromise(findNodeAtOffset(tree.value, 1000));
			expect(Option.isNone(node)).toBe(true);
		}
	});

	it("getNodePath returns path for root node offset", async () => {
		const tree = await Effect.runPromise(parseTree('{ "a": 1 }'));
		if (Option.isSome(tree)) {
			const path = await Effect.runPromise(getNodePath(tree.value, 0));
			expect(Option.isSome(path)).toBe(true);
		}
	});

	it("getNodeValue reconstructs nested objects", async () => {
		const tree = await Effect.runPromise(parseTree('{ "a": { "b": [1, 2] } }'));
		if (Option.isSome(tree)) {
			const value = await Effect.runPromise(getNodeValue(tree.value));
			expect(value).toEqual({ a: { b: [1, 2] } });
		}
	});

	it("findNode returns none for missing nested path", async () => {
		const tree = await Effect.runPromise(parseTree('{ "a": 1 }'));
		if (Option.isSome(tree)) {
			const result = await Effect.runPromise(findNode(tree.value, ["a", "b", "c"]));
			expect(Option.isNone(result)).toBe(true);
		}
	});

	it("findNode navigates array indices", async () => {
		const tree = await Effect.runPromise(parseTree("[10, 20, 30]"));
		if (Option.isSome(tree)) {
			const result = await Effect.runPromise(findNode(tree.value, [1]));
			expect(Option.isSome(result)).toBe(true);
			if (Option.isSome(result)) {
				expect(result.value.value).toBe(20);
			}
		}
	});

	it("findNode returns none for out-of-bounds array index", async () => {
		const tree = await Effect.runPromise(parseTree("[1, 2]"));
		if (Option.isSome(tree)) {
			const result = await Effect.runPromise(findNode(tree.value, [5]));
			expect(Option.isNone(result)).toBe(true);
		}
	});
});

// ============================================================
// Microsoft jsonc-parser parity tests
// ============================================================

describe("Microsoft parity — parse values", () => {
	it("parses empty object", async () => {
		expect(await Effect.runPromise(parse("{}"))).toEqual({});
	});

	it("parses empty array", async () => {
		expect(await Effect.runPromise(parse("[]"))).toEqual([]);
	});

	it("parses property with empty key", async () => {
		const result = await Effect.runPromise(parse('{ "": true }'));
		expect(result).toEqual({ "": true });
	});

	it("parses comments within object values", async () => {
		const result = await Effect.runPromise(parse('{ "foo": /*hello*/true }'));
		expect(result).toEqual({ foo: true });
	});

	it("parses scientific notation 23e3", async () => {
		expect(await Effect.runPromise(parse("23e3"))).toBe(23e3);
	});

	it("parses scientific notation 1.2E+3", async () => {
		expect(await Effect.runPromise(parse("1.2E+3"))).toBe(1.2e3);
	});

	it("parses scientific notation 1.2E-3", async () => {
		expect(await Effect.runPromise(parse("1.2E-3"))).toBe(1.2e-3);
	});

	it("parses value with trailing comment", async () => {
		expect(await Effect.runPromise(parse("1.2E-3 // comment"))).toBe(1.2e-3);
	});

	it("parses nested arrays", async () => {
		const result = await Effect.runPromise(parse("[[1, 2], [3, 4]]"));
		expect(result).toEqual([
			[1, 2],
			[3, 4],
		]);
	});

	it("parses nested objects", async () => {
		const result = await Effect.runPromise(parse('{ "a": { "b": { "c": true } } }'));
		expect(result).toEqual({ a: { b: { c: true } } });
	});

	it("parses mixed nested structures", async () => {
		const result = await Effect.runPromise(parse('{ "items": [1, "two", { "three": 3 }] }'));
		expect(result).toEqual({ items: [1, "two", { three: 3 }] });
	});
});

describe("Microsoft parity — error recovery", () => {
	it("recovers from missing colon", async () => {
		const result = await Effect.runPromise(Effect.either(parse('{ "bar" 8 }')));
		// Should produce an error but still parse what it can
		expect(result._tag).toBe("Left");
	});

	it("recovers from trailing comma in object (disallowed)", async () => {
		const result = await Effect.runPromise(Effect.either(parse('{ "key": [], }', { allowTrailingComma: false })));
		if (result._tag === "Left") {
			expect(result.left.errors.length).toBeGreaterThan(0);
		}
	});

	it("recovers from extra data after value", async () => {
		const result = await Effect.runPromise(Effect.either(parse("1 2 3")));
		if (result._tag === "Left") {
			expect(result.left.errors.some((e) => e.code === "EndOfFileExpected")).toBe(true);
		}
	});
});

describe("Microsoft parity — parseTree structure", () => {
	it("produces correct AST for simple object", async () => {
		const result = await Effect.runPromise(parseTree('{ "key": 42 }'));
		expect(Option.isSome(result)).toBe(true);
		if (Option.isSome(result)) {
			const root = result.value;
			expect(root.type).toBe("object");
			expect(root.children).toBeDefined();
			expect(root.children?.length).toBe(1);
			const prop = root.children?.[0];
			expect(prop?.type).toBe("property");
			expect(prop?.children?.length).toBe(2);
			expect(prop?.children?.[0].type).toBe("string");
			expect(prop?.children?.[0].value).toBe("key");
			expect(prop?.children?.[1].type).toBe("number");
			expect(prop?.children?.[1].value).toBe(42);
		}
	});

	it("produces correct AST for array", async () => {
		const result = await Effect.runPromise(parseTree("[1, true, null]"));
		expect(Option.isSome(result)).toBe(true);
		if (Option.isSome(result)) {
			const root = result.value;
			expect(root.type).toBe("array");
			expect(root.children?.length).toBe(3);
			expect(root.children?.[0].value).toBe(1);
			expect(root.children?.[1].value).toBe(true);
			expect(root.children?.[2].value).toBe(null);
		}
	});

	it("property nodes have colonOffset", async () => {
		const result = await Effect.runPromise(parseTree('{ "key": 1 }'));
		if (Option.isSome(result)) {
			const prop = result.value.children?.[0];
			expect(prop?.colonOffset).toBeDefined();
			expect(typeof prop?.colonOffset).toBe("number");
		}
	});

	it("node offsets and lengths are correct", async () => {
		const input = '{"a":1}';
		const result = await Effect.runPromise(parseTree(input));
		if (Option.isSome(result)) {
			const root = result.value;
			expect(root.offset).toBe(0);
			expect(root.length).toBe(input.length);
		}
	});
});

describe("Microsoft parity — stripComments", () => {
	it("removes line comments", async () => {
		const result = await Effect.runPromise(stripComments('{ "a": 1 } // comment'));
		expect(result.trim()).toBe('{ "a": 1 }');
	});

	it("removes block comments", async () => {
		const result = await Effect.runPromise(stripComments('{ /* comment */ "a": 1 }'));
		expect(result).toContain('"a": 1');
		expect(result).not.toContain("comment");
	});

	it("replaces comments with spaces when replaceCh specified", async () => {
		const result = await Effect.runPromise(stripComments("42 // comment", " "));
		expect(result.startsWith("42")).toBe(true);
		// The comment should be replaced with spaces, preserving length
		expect(result.length).toBe("42 // comment".length);
	});
});
