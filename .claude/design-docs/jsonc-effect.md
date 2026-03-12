---
status: draft
module: jsonc-effect
category: architecture
created: 2026-03-12
updated: 2026-03-12
last-synced: 2026-03-12
completeness: 45
related: []
dependencies: []
---

# jsonc-effect - Architecture

Pure Effect-TS implementation of a JSONC (JSON with Comments) parser with no external parser
dependencies.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [System Architecture](#system-architecture)
5. [Data Flow](#data-flow)
6. [Effect Patterns Used](#effect-patterns-used)
7. [Implementation Status](#implementation-status)
8. [Testing Strategy](#testing-strategy)
9. [Future Enhancements](#future-enhancements)
10. [Related Documentation](#related-documentation)

---

## Overview

jsonc-effect is a pure Effect-TS implementation of a JSONC (JSON with Comments) parser. The scanner,
parser, AST construction, and formatting are all implemented natively -- the only runtime dependency
is `effect`. Microsoft's jsonc-parser (MIT) serves as the design reference for token types, AST
structure, and parser behavior, but it is not a dependency.

The package provides three primary APIs: `parse` (JSONC string to JavaScript value), `parseTree`
(JSONC string to AST), and `stripComments` (remove comments to produce valid JSON). All APIs return
Effect values, enabling typed error handling and composition with other Effect-based code.

**Key Design Principles:**

- Pure functions approach -- parsing is synchronous and stateless, no services required
- Single-package structure with pnpm + Turbo build orchestration
- Effect-native error handling with accumulating errors (parser collects all errors, not just first)
- Schema-driven data types for structural equality and self-documenting token/node definitions

**When to reference this document:**

- When modifying the scanner or parser logic
- When adding new AST node types or token kinds
- When implementing downstream features (navigation, formatting, modification)
- When debugging parse error handling or token stream issues

---

## Current State

### File Structure

```text
src/
  errors.ts        # JsoncParseError, JsoncNodeNotFoundError, JsoncModificationError
  schemas.ts       # JsoncSyntaxKind, JsoncScanError, JsoncToken, JsoncNode, options
  scanner.ts       # createScanner -- lexer producing token stream
  parse.ts         # parse, parseTree, stripComments
  index.ts         # barrel exports
  index.test.ts    # 42 tests covering errors, schemas, scanner, parser
```

### System Components

#### Component 1: Error Types (`errors.ts`)

**Purpose:** Define typed error classes for all failure modes across parsing, navigation, and
modification.

**Exports:**

- `JsoncParseErrorCode` -- Schema.Literal union of 16 parse error codes
- `JsoncParseErrorDetail` -- Schema.Class with code, message, offset, length, line/character
- `JsoncParseError` -- Data.TaggedError aggregating multiple error details
- `JsoncNodeNotFoundError` -- Data.TaggedError for AST navigation failures
- `JsoncModificationError` -- Data.TaggedError for edit/modify failures

**Pattern:** Each error uses `Data.TaggedError` with a `*Base` export for api-extractor
compatibility. The base is exported separately so downstream consumers can extend or reference the
tag without importing the full class.

#### Component 2: Schema Definitions (`schemas.ts`)

**Purpose:** Define all data types as Effect Schema classes for structural equality, validation,
and self-documenting code.

**Exports:**

- `JsoncSyntaxKind` -- 16 token types as string literals (not numeric enums)
- `JsoncScanError` -- 7 scanner error codes as string literals
- `JsoncToken` -- Schema.Class for scanner output tokens
- `JsoncNode` -- Schema.Class for AST nodes (recursive via Schema.suspend)
- `JsoncNodeType` -- 7 node types: object, array, property, string, number, boolean, null
- `JsoncSegment`, `JsoncPath` -- path types for AST navigation
- `JsoncEdit`, `JsoncRange` -- types for document modification
- `JsoncParseOptions` -- options with defaults (disallowComments=false, allowTrailingComma=true,
  allowEmptyContent=false)
- `JsoncFormattingOptions` -- formatting settings (tabSize, insertSpaces, eol, etc.)

#### Component 3: Scanner (`scanner.ts`)

**Purpose:** Lexer that converts a JSONC string into a stream of tokens via a stateful cursor
interface.

**Interface:** `JsoncScanner` with methods: `scan()`, `getToken()`, `getTokenValue()`,
`getTokenOffset()`, `getTokenLength()`, `getTokenStartLine()`, `getTokenStartCharacter()`,
`getTokenError()`, `getPosition()`, `setPosition()`.

**Factory:** `createScanner(text, ignoreTrivia?)` -- creates a scanner instance. The `ignoreTrivia`
parameter controls whether whitespace, line breaks, and comments are skipped or emitted as tokens.

**Implementation details:**

- Character-level scanning using `charCodeAt()` for performance
- Handles line comments (`//`), block comments (`/* */`), strings with escapes, numbers with
  fractional and exponent parts
- Reports scan errors via `getTokenError()` without throwing
- Tracks line numbers and character positions for error reporting

#### Component 4: Parser (`parse.ts`)

**Purpose:** Recursive descent parser that consumes the scanner's token stream and produces either
JavaScript values or AST nodes.

**Exports:**

- `parse(text, options?)` -- returns `Effect.Effect<unknown, JsoncParseError>` with the parsed
  JavaScript value
- `parseTree(text, options?)` -- returns `Effect.Effect<Option.Option<JsoncNode>, JsoncParseError>`
  with the AST
- `stripComments(text, replaceCh?)` -- returns `Effect.Effect<string>` with comments removed

**Implementation details:**

- Uses `createScanner(text, false)` (ignoreTrivia=false) so the parser sees comment tokens, which
  is required to support the `disallowComments` option
- `token()` getter function defeats TypeScript control-flow narrowing -- necessary because
  `scanNext()` mutates the current token via closure and TS incorrectly narrows after switch cases
- Error accumulation: the parser collects all errors into an array and continues parsing rather
  than stopping at the first error
- `parseTree` builds AST using mutable internal `MutableJsoncNode` interface, then casts to the
  immutable `JsoncNode` Schema.Class at boundaries
- `stripComments` uses a separate scanner pass, replacing comment spans with the optional
  replacement character or removing them entirely

### Architecture Diagram

```text
                    JSONC String Input
                          |
                          v
               +--------------------+
               |   createScanner()  |
               |  (scanner.ts)      |
               +--------------------+
                    |         |
                    v         v
         ignoreTrivia=true  ignoreTrivia=false
              |                    |
              v                    v
    stripComments()         parseInternal()
    (simple scan loop)      (recursive descent)
                                   |
                          +--------+--------+
                          |                 |
                     buildTree=false    buildTree=true
                          |                 |
                          v                 v
                     parse()           parseTree()
                   JS value          Option<JsoncNode>
                          |                 |
                          v                 v
                   Effect.succeed    Effect.succeed
                   or Effect.fail    or Effect.fail
                   (JsoncParseError) (JsoncParseError)
```

### Current Limitations

- No AST navigation utilities yet (findNodeAtLocation, getNodePath, etc.)
- No visitor/stream API for incremental processing
- No formatting or modification operations (format, modify, applyEdits)
- Error types for navigation and modification are defined but not yet used by any implementation

---

## Rationale

### Architectural Decisions

#### Decision 1: String Literals for Token Types

**Context:** Token types needed to be represented as a discriminated type for pattern matching.

**Options considered:**

1. **String literals via Schema.Literal (Chosen):**
   - Pros: Self-documenting in debug output, natural JSON serialization, readable test assertions
   - Cons: Slightly more memory per token vs. numeric values
   - Why chosen: Developer experience far outweighs the negligible performance difference

2. **Numeric enums (TypeScript enum):**
   - Pros: Traditional approach, compact representation
   - Cons: Opaque in debug output (shows numbers), requires reverse mapping for display
   - Why rejected: Poor developer experience, not idiomatic Effect-TS

#### Decision 2: Data.TaggedError with Base Export Pattern

**Context:** Error types need to work with Effect's error channel and be compatible with
api-extractor for documentation generation.

**Options considered:**

1. **Data.TaggedError with *Base export (Chosen):**
   - Pros: Works with api-extractor, allows downstream extension, clear tag identification
   - Cons: Extra export per error type
   - Why chosen: Required for api-extractor compatibility in the publishing pipeline

2. **Plain Data.TaggedError:**
   - Pros: Simpler, fewer exports
   - Cons: api-extractor cannot properly document the error class hierarchy
   - Why rejected: Breaks documentation generation

#### Decision 3: Schema.Class for Data Types

**Context:** Tokens, nodes, and options need structural equality, validation, and clear type
definitions.

**Options considered:**

1. **Schema.Class (Chosen):**
   - Pros: Structural equality built in, validation, self-documenting, composable with Schema
     pipelines
   - Cons: Slightly more overhead than plain interfaces
   - Why chosen: Enables future Schema integration (transformOrFail pipelines) and provides
     structural equality for testing

2. **Plain TypeScript interfaces + manual constructors:**
   - Pros: Lighter weight, no Schema dependency
   - Cons: No structural equality, no validation, no Schema composition
   - Why rejected: Would require reimplementing validation and equality

#### Decision 4: token() Getter Function in Parser

**Context:** TypeScript's control-flow narrowing incorrectly narrows the token type after switch
cases in the parser, because `scanNext()` mutates `currentToken` via closure.

**Options considered:**

1. **token() getter function (Chosen):**
   - Pros: Defeats narrowing, explicit about the dynamic nature of the value
   - Cons: Extra function call
   - Why chosen: Clean solution that makes the mutation semantics explicit

2. **Type assertions (as JsoncSyntaxKind):**
   - Pros: Direct
   - Cons: Scattered type assertions, easy to forget, masks real type issues
   - Why rejected: Fragile and obscures intent

#### Decision 5: Scanner with ignoreTrivia=false in Parser

**Context:** The parser needs to see comment tokens to support the `disallowComments` option.

**Why:** If the scanner skips trivia, the parser has no way to detect and report comments when
`disallowComments` is true. Using `ignoreTrivia=false` lets the parser's `scanNext()` loop handle
comment tokens explicitly.

#### Decision 6: Error Accumulation

**Context:** Parse errors need to be reported to users for JSONC content (config files, etc.).

**Why:** Stopping at the first error provides poor user experience. Accumulating all errors lets
tooling show all issues at once, similar to how IDEs report multiple diagnostics. The parser
continues past errors using skip-until recovery strategies.

#### Decision 7: allowTrailingComma Defaults to true

**Context:** The primary consumer is `bun.lock` files which use trailing commas.

**Why:** Unlike Microsoft's jsonc-parser which defaults to false, this package defaults to true
because the primary use case is parsing bun.lock and similar config files where trailing commas
are standard.

### Design Patterns Used

#### Pattern 1: Recursive Descent Parsing

- **Where used:** `parse.ts` -- `parseValue`, `parseObject`, `parseArray` and their tree variants
- **Why used:** Natural fit for JSON grammar, straightforward implementation, easy to extend
- **Implementation:** Mutually recursive functions consuming tokens from the scanner

#### Pattern 2: Closure-Based State Machine

- **Where used:** `scanner.ts` -- `createScanner` returns an interface over closed-over mutable
  state
- **Why used:** Encapsulates scanner state (position, current token, line tracking) without
  requiring a class
- **Implementation:** Factory function returns object with methods that close over shared mutable
  variables

#### Pattern 3: Effect.sync Wrapping

- **Where used:** `parse.ts` -- all public functions wrap synchronous parsing in Effect.sync
- **Why used:** Parsing is inherently synchronous but needs to participate in Effect pipelines
- **Implementation:** `Effect.sync(() => parseInternal(...))` followed by `Effect.flatMap` to
  convert error arrays to `Effect.fail`

---

## System Architecture

### Single-Layer Architecture

This is a single-package library, not a layered application. The architecture is a simple pipeline:

**Input layer:** Raw JSONC string

**Scanning layer:** `createScanner` tokenizes the input into a stream of `JsoncSyntaxKind` tokens

**Parsing layer:** `parseInternal` consumes tokens via recursive descent, producing either:

- JavaScript values (when `buildTree=false`)
- AST nodes as `JsoncNode` (when `buildTree=true`)

**Effect layer:** Public API functions (`parse`, `parseTree`, `stripComments`) wrap the synchronous
internals in `Effect.sync` and convert error arrays to `Effect.fail(JsoncParseError)`.

### Build Pipeline

The package uses Rslib with dual output:

1. `dist/dev/` -- Development build with source maps (used via publishConfig.linkDirectory)
2. `dist/npm/` -- Production build for npm publishing with provenance

Turbo orchestrates builds with task dependencies: `typecheck` depends on `build` completing first.

---

## Data Flow

### Parse Flow (JSONC String to JavaScript Value)

```text
"{ /* comment */ \"key\": 42 }"
          |
          v
  createScanner(text, false)
          |
    scan() loop
          |
  tokens: OpenBrace, BlockComment, String("key"), Colon, Number(42), CloseBrace, EOF
          |
    scanNext() skips: BlockComment, Trivia, LineBreak
          |
  parseObject() consumes: OpenBrace -> String -> Colon -> Number -> CloseBrace
          |
          v
  { key: 42 }  (JavaScript object)
          |
    errors.length === 0 ?
      Effect.succeed({ key: 42 })
      Effect.fail(new JsoncParseError({ errors, text, options }))
```

### Parse Tree Flow (JSONC String to AST)

```text
"{ \"key\": 42 }"
       |
       v
  parseObjectTree()
       |
       v
  JsoncNode {
    type: "object",
    offset: 0, length: 16,
    children: [
      JsoncNode {
        type: "property",
        offset: 2, length: 12,
        colonOffset: 7,
        children: [
          JsoncNode { type: "string", value: "key", offset: 2, length: 5 },
          JsoncNode { type: "number", value: 42, offset: 9, length: 2 }
        ]
      }
    ]
  }
       |
       v
  Option.some(node) wrapped in Effect.succeed
```

### Token Types

The scanner produces tokens with these `JsoncSyntaxKind` values:

| Kind | Example | Notes |
| :---- | :------- | :---- |
| OpenBrace | `{` | Object start |
| CloseBrace | `}` | Object end |
| OpenBracket | `[` | Array start |
| CloseBracket | `]` | Array end |
| Comma | `,` | Element separator |
| Colon | `:` | Key-value separator |
| String | `"hello"` | Value is unescaped content |
| Number | `42`, `-3.14e2` | Integer, float, or scientific |
| True | `true` | Boolean literal |
| False | `false` | Boolean literal |
| Null | `null` | Null literal |
| LineComment | `// text` | Skipped by parser unless disallowComments |
| BlockComment | `/* text */` | Skipped by parser unless disallowComments |
| LineBreak | `\n`, `\r\n` | Only emitted when ignoreTrivia=false |
| Trivia | spaces, tabs | Only emitted when ignoreTrivia=false |
| Unknown | anything else | Produces InvalidCharacter or InvalidSymbol error |
| EOF | end of input | Signals end of token stream |

---

## Effect Patterns Used

### Data.TaggedError with *Base Export

```typescript
export const JsoncParseErrorBase = Data.TaggedError("JsoncParseError");
export class JsoncParseError extends JsoncParseErrorBase<{
  readonly errors: ReadonlyArray<JsoncParseErrorDetail>;
  readonly text: string;
  readonly options?: unknown;
}> {
  get message(): string { /* ... */ }
}
```

The `*Base` export is required for api-extractor compatibility. Without it, api-extractor cannot
properly resolve the class hierarchy for documentation generation.

### Schema.Class for Data Types

```typescript
export class JsoncToken extends Schema.Class<JsoncToken>("JsoncToken")({
  kind: JsoncSyntaxKind,
  value: Schema.String,
  offset: Schema.Number,
  // ...
}) {}
```

Provides structural equality (two tokens with the same fields are equal), validation, and composable
Schema pipelines for future transformOrFail integration.

### Schema.Literal for Union Types

```typescript
export const JsoncSyntaxKind = Schema.Literal(
  "OpenBrace", "CloseBrace", "OpenBracket", /* ... */
);
```

String literals instead of numeric enums for self-documenting debug output and natural JSON
serialization.

### Effect.sync for Synchronous Wrapping

```typescript
export const parse = (text, options?) =>
  Effect.sync(() => parseInternal(text, options ?? {}, false)).pipe(
    Effect.flatMap(({ value, errors }) => {
      if (errors.length > 0) return Effect.fail(new JsoncParseError({ errors, text, options }));
      return Effect.succeed(value);
    }),
  );
```

Wraps synchronous parsing in Effect for composition with Effect pipelines, typed error channels,
and consistent API surface.

### Option.Option for Empty Content

```typescript
export const parseTree = (text, options?) =>
  // ...
  Effect.succeed(root ? Option.some(root) : Option.none());
```

`parseTree` returns `Option.Option<JsoncNode>` to distinguish between empty content (Option.none)
and a valid parse result (Option.some).

---

## Implementation Status

### Phase 1: Foundation (Issues #2-#4)

- [x] **Issue #2: Project Setup** -- package renamed to jsonc-effect, effect dependency added,
  template code removed
- [x] **Issue #3: Error Types and Schema Definitions** -- all error types (JsoncParseError,
  JsoncNodeNotFoundError, JsoncModificationError), token schemas (JsoncSyntaxKind, JsoncScanError,
  JsoncToken), AST node schemas (JsoncNode, JsoncNodeType), parse and formatting options
- [ ] **Issue #4: Scanner and Core Parser** -- scanner complete, parser complete, 42 tests passing;
  needs final review and merge

### Phase 2: Schema Integration (Issue #5)

- [ ] **Issue #5: Schema Integration** -- transformOrFail pipelines for parsing JSONC strings
  directly into validated Schema types

### Phase 3: AST Navigation (Issue #6)

- [ ] **Issue #6: AST Navigation** -- findNodeAtLocation, getNodePath, getNodeValue, getNodeType
  utilities using the JsoncNode AST

### Phase 4: Visitor/Stream API (Issue #7)

- [ ] **Issue #7: Visitor/Stream API** -- visit() for walking the AST, stream-based parsing for
  large documents

### Phase 5: Formatting and Modification (Issue #8)

- [ ] **Issue #8: Formatting and Modification** -- format(), modify(), applyEdits() operations
  using JsoncEdit, JsoncFormattingOptions

### Phase 6: Documentation and Coverage (Issue #9)

- [ ] **Issue #9: Documentation and Full Test Coverage** -- TSDoc comments, README, usage examples,
  100% test coverage target

---

## Testing Strategy

### Current Test Coverage

42 tests organized into four suites:

**Error types:** Verify `_tag` values, message formatting, pluralization, structural equality, and
all three error classes (JsoncParseError, JsoncNodeNotFoundError, JsoncModificationError).

**Schema definitions:** Verify Schema.Class construction, structural equality, default values in
JsoncParseOptions and JsoncFormattingOptions, JsoncNode recursive structure.

**Scanner:** Verify tokenization of all token types, escape sequences, unicode escapes, block and
line comments, numbers (integer, float, negative, exponent), error detection.

**Parser:** Verify parse() and parseTree() for objects, arrays, nested structures, strings, numbers,
booleans, null, comments, trailing commas, error accumulation, disallowComments option,
allowEmptyContent option, stripComments with and without replacement character.

### Test Configuration

- **Framework:** Vitest with v8 coverage
- **Pool:** Uses forks (not threads) for Effect-TS compatibility
- **Running:** `pnpm run test` (all), `pnpm vitest run src/index.test.ts` (specific file)

---

## Future Enhancements

### Phase 2: Schema Integration (Next)

- `transformOrFail` pipelines to parse JSONC strings directly into validated Schema types
- Enables typed config file parsing: `Schema.decode(MyConfigSchema)(jsoncString)`
- Primary motivation for the Effect-TS approach

### Phase 3-5: Full Feature Parity

- AST navigation (findNodeAtLocation, etc.) for tooling integration
- Visitor/stream API for large document processing
- Format/modify/applyEdits for programmatic JSONC manipulation

### Phase 6: Polish

- Full TSDoc coverage for all exports
- README with usage examples
- 100% test coverage

---

## Related Documentation

**Package:**

- `README.md` -- Package overview (stub)
- `CLAUDE.md` -- Development guide and conventions

**External References:**

- [Microsoft jsonc-parser](https://github.com/microsoft/node-jsonc-parser) -- Design reference (MIT)
- [Effect-TS](https://effect.website/) -- Runtime dependency and patterns

---

**Document Status:** Draft -- covers foundation architecture and key design decisions for Phases 1-2.
Scanner and parser implementation is complete and well-tested. Future phases (navigation, visitor,
formatting) will require updates to this document as they are implemented.

**Next Steps:** Update this document when Issue #5 (Schema Integration) implementation begins to
capture the transformOrFail pipeline architecture.
