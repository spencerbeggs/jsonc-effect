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
