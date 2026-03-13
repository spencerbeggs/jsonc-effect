---
status: current
module: jsonc-effect
category: architecture
created: 2026-03-12
updated: 2026-03-13
last-synced: 2026-03-13
completeness: 95
related:
  - scanner.md
  - parser.md
  - schema-integration.md
  - ast-navigation.md
  - visitor.md
  - formatting.md
  - equality.md
  - error-types.md
  - effect-patterns.md
dependencies: []
---

# jsonc-effect - Architecture Overview

Pure Effect-TS implementation of a JSONC (JSON with Comments) parser with no external parser
dependencies.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [System Architecture](#system-architecture)
5. [Data Flow](#data-flow)
6. [Testing Strategy](#testing-strategy)
7. [Future Enhancements](#future-enhancements)
8. [Related Documentation](#related-documentation)

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
- Platform independent -- no `node:` imports anywhere

**When to reference this document:**

- When understanding the overall system architecture
- When adding new modules or components
- When onboarding to the codebase

---

## Current State

All implementation phases complete. GitHub Issues #1-#9 all closed.

- **Tests:** 207 passing
- **Coverage:** ~89% statements, ~82% branches, ~99% functions
- **Branch:** `feat/implementation` (pushed, ready for PR)

### Source Structure

```text
src/
  errors.ts              # JsoncParseError, JsoncNodeNotFoundError, JsoncModificationError
  schemas.ts             # JsoncSyntaxKind, JsoncScanError, JsoncToken, JsoncNode, options
  scanner.ts             # createScanner -- lexer producing token stream
  parse.ts               # parse, parseTree, stripComments
  schema-integration.ts  # JsoncFromString, makeJsoncFromString, makeJsoncSchema
  ast.ts                 # findNode, findNodeAtOffset, getNodePath, getNodeValue
  visitor.ts             # visit, visitCollect, JsoncVisitorEvent
  format.ts              # format, modify, applyEdits, formatAndApply
  equality.ts            # equals, equalsValue -- semantic JSONC comparison
  index.ts               # barrel exports
  index.test.ts          # 207 tests covering all modules
```

### Component Summary

| Component | File | Purpose |
| :-------- | :--- | :------ |
| Error Types | `errors.ts` | Typed error classes for all failure modes |
| Schema Definitions | `schemas.ts` | Data types as Effect Schema classes |
| Scanner | `scanner.ts` | Lexer: JSONC string to token stream |
| Parser | `parse.ts` | Recursive descent: tokens to values/AST |
| Schema Integration | `schema-integration.ts` | JSONC string to typed domain objects |
| AST Navigation | `ast.ts` | Pipe-friendly traversal of parse trees |
| Visitor | `visitor.ts` | SAX-style event stream API |
| Formatting | `format.ts` | Edit computation for formatting and modification |
| Equality | `equality.ts` | Semantic JSONC document comparison |

See individual design docs for detailed component documentation.

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

               Schema Integration Pipeline
               ===========================
                    JSONC String
                         |
                         v
               Schema.transformOrFail
               (makeJsoncFromString)
                         |
                    parse(input)
                         |
                         v
                   unknown value
                         |
                   Schema.compose
               (makeJsoncSchema)
                         |
                         v
                    typed A value

               AST Navigation Pipeline
               =======================
               Option<JsoncNode> (from parseTree)
                         |
                    Function.dual
                         |
              +----------+-----------+
              |          |           |
         findNode   findNodeAt   getNodePath
         (path)     Offset(n)    (offset)
              |          |           |
              v          v           v
         Option<Node> Option<Node> Option<Path>

               Visitor Pipeline
               ================
                    JSONC String
                         |
                    visit(text)
                         |
                    visitImpl()
                    (scanner-driven)
                         |
                         v
               JsoncVisitorEvent[]
                         |
               Stream.fromIterable
                         |
                         v
               Stream<JsoncVisitorEvent>

               Format Pipeline
               ===============
                    JSONC String
                         |
              +----------+----------+
              |                     |
         format(text)          modify(text, path, value)
         (scanner-driven)      (scanner-driven navigation)
              |                     |
              v                     v
         JsoncEdit[]           JsoncEdit[]
              |                     |
              +----------+----------+
                         |
                    applyEdits
                    (reverse offset order)
                         |
                         v
                    formatted string

               Equality Pipeline
               =================
                    JSONC String(s)
                         |
              +----------+----------+
              |                     |
         equals(a, b)         equalsValue(a, val)
         (parses both)        (parses one)
              |                     |
         Effect.all([             parse(a)
           parse(a),                |
           parse(b)])               v
              |               deepEqual(parsed, val)
              v                     |
         deepEqual(a, b)           v
              |               Effect<boolean>
              v
         Effect<boolean>
```

---

## Rationale

### Key Architectural Decisions

1. **String literals for token types** -- Self-documenting debug output, natural JSON serialization,
   readable test assertions. See [effect-patterns.md](effect-patterns.md) for Schema.Literal usage.

2. **Data.TaggedError with *Base exports** -- Required for api-extractor DTS compatibility. See
   [error-types.md](error-types.md) for the pattern.

3. **Schema.Class for data types** -- Structural equality, validation, and composable Schema
   pipelines. See [effect-patterns.md](effect-patterns.md).

4. **Error accumulation** -- Parser collects all errors rather than stopping at the first, similar
   to IDE diagnostic reporting. See [parser.md](parser.md).

5. **allowTrailingComma defaults to true** -- Unlike Microsoft's jsonc-parser (defaults false),
   because JSONC config files commonly use trailing commas.

6. **Pure functions, not services** -- Parsing is synchronous and stateless, so Effect services
   would add unnecessary complexity. All public APIs use `Effect.sync` wrapping.

7. **Platform independent** -- No `node:` imports anywhere, enabling browser and edge runtime usage.

### Design Patterns

| Pattern | Where Used | Why |
| :------ | :--------- | :-- |
| Recursive Descent | `parse.ts` | Natural fit for JSON grammar |
| Closure-Based State Machine | `scanner.ts` | Encapsulates scanner state without classes |
| Effect.sync Wrapping | `parse.ts` | Synchronous code in Effect pipelines |
| Function.dual | `ast.ts`, `format.ts`, `equality.ts` | Data-first and data-last calling conventions |
| Schema.transformOrFail | `schema-integration.ts` | JSONC to typed domain objects |

---

## System Architecture

### Single-Layer Architecture

This is a single-package library, not a layered application. The architecture is a pipeline:

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

See [scanner.md](scanner.md) for token type details and [parser.md](parser.md) for the full
parsing pipeline.

---

## Testing Strategy

207 tests organized into suites covering all modules:

- **Error types** -- `_tag` values, message formatting, structural equality
- **Schema definitions** -- Schema.Class construction, defaults, recursive structure
- **Scanner** -- All token types, escape sequences, unicode, comments, numbers, errors
- **Parser** -- parse/parseTree for all value types, error accumulation, options
- **Schema Integration** (14 tests) -- Round-trip, custom options, composed schemas
- **AST Navigation** (11 tests) -- Path navigation, offset lookup, value reconstruction
- **Visitor/Stream** (13 tests) -- Event emission, filtering, error events
- **Formatting/Modification** (10 tests) -- Format, range format, modify, applyEdits

**Configuration:**

- **Framework:** Vitest with v8 coverage
- **Pool:** Uses forks (not threads) for Effect-TS compatibility
- **Running:** `pnpm run test` (all), `pnpm vitest run src/index.test.ts` (specific file)

---

## Future Enhancements

- JsoncString branded type for validated JSONC input
- Performance benchmarks vs Microsoft jsonc-parser
- API documentation generation via api-extractor

---

## Related Documentation

**Component Design Docs:**

- [Scanner](scanner.md) -- Lexer implementation and token types
- [Parser](parser.md) -- Recursive descent parser, error accumulation
- [Schema Integration](schema-integration.md) -- transformOrFail pipelines
- [AST Navigation](ast-navigation.md) -- findNode, findNodeAtOffset, getNodePath, getNodeValue
- [Visitor](visitor.md) -- SAX-style event stream API
- [Formatting](formatting.md) -- format, modify, applyEdits, formatAndApply
- [Equality](equality.md) -- Semantic JSONC document comparison
- [Error Types](error-types.md) -- TaggedError pattern, error codes
- [Effect Patterns](effect-patterns.md) -- Catalog of Effect patterns used

**Package:**

- `README.md` -- Package overview with usage examples
- `CLAUDE.md` -- Development guide and conventions

**External References:**

- [Microsoft jsonc-parser](https://github.com/microsoft/node-jsonc-parser) -- Design reference (MIT)
- [Effect-TS](https://effect.website/) -- Runtime dependency and patterns
