---
status: current
module: jsonc-effect
category: architecture
created: 2026-03-12
updated: 2026-07-06
last-synced: 2026-07-06
completeness: 95
related:
  - architecture.md
  - scanner.md
  - formatting.md
  - error-types.md
  - effect-patterns.md
dependencies:
  - scanner.md
  - error-types.md
---

# Parser

Recursive descent parser that consumes the scanner's token stream and produces either JavaScript values or AST nodes.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [Related Documentation](#related-documentation)

---

## Overview

The parser (`parse.ts`) is the core of the JSONC processing pipeline. It uses `createScanner` to tokenize input and then walks the token stream via mutually recursive functions (`parseValue`, `parseObject`, `parseArray` and their tree-building variants). The parser supports two modes: value parsing (producing JavaScript values) and tree parsing (producing `JsoncNode` AST).

**When to reference this document:**

- When modifying the recursive descent logic
- When changing error accumulation behavior
- When adding support for new JSONC features
- When debugging parse error handling or node span computation

---

## Current State

### Exports

| Function | Signature | Description |
| :------- | :-------- | :---------- |
| `parse` | `(text, options?) => Effect<unknown, JsoncParseError>` | Parse JSONC to JavaScript value |
| `parseTree` | `(text, options?) => Effect<Option<JsoncNode>, JsoncParseError>` | Parse JSONC to AST |
| `stripComments` | `(text, replaceCh?) => Effect<string>` | Remove comments from JSONC text |

### Implementation Details

- Uses `createScanner(text, false)` (ignoreTrivia=false) so the parser sees comment tokens, which is required to support the `disallowComments` option
- `token()` getter function defeats TypeScript control-flow narrowing -- necessary because `scanNext()` mutates the current token via closure and TS incorrectly narrows after switch cases
- Error accumulation: the parser collects all errors into an array and continues parsing rather than stopping at the first error, using skip-until recovery strategies
- `parseTree` builds AST using mutable internal `MutableJsoncNode` interface, then casts to the immutable `JsoncNode` Schema.Class at boundaries
- `stripComments` uses a separate scanner pass with `ignoreTrivia=true`, replacing comment spans with the optional replacement character or removing them entirely

### Node Span Semantics (Tight Spans)

`JsoncNode.offset`/`length` spans are **tight**: they end at the last token belonging to the node, excluding any trailing whitespace or comments. This is a behavior contract that `modify` (see [Formatting](formatting.md)) and editor integrations depend on.

- A `tokenEnd()` helper (`getTokenOffset() + getTokenLength()`) captures the end of the current token *before* `scanNext()` advances, because advancing skips trivia and the next token's offset would overshoot the node's true end (issue #62)
- Value, key, array and object node lengths all derive from the tight end of their last consumed token
- Property node lengths derive from their value node's end (`valueNode.offset + valueNode.length - property.offset`)
- On error recovery (missing `}` or `]`), the length falls back to the current token offset

### Effect Wrapping

All public functions wrap synchronous parsing in `Effect.sync`:

```typescript
export const parse = (text, options?) =>
  Effect.sync(() => parseInternal(text, options ?? {}, false)).pipe(
    Effect.flatMap(({ value, errors }) => {
      if (errors.length > 0) return Effect.fail(new JsoncParseError({ errors, text, options }));
      return Effect.succeed(value);
    }),
  );
```

### Parse Options

| Option | Default | Description |
| :----- | :------ | :---------- |
| `disallowComments` | `false` | Report errors for comments |
| `allowTrailingComma` | `true` | Allow trailing commas in objects and arrays |
| `allowEmptyContent` | `false` | Allow empty input without error |

---

## Rationale

### token() Getter Function

TypeScript's control-flow narrowing incorrectly narrows the token type after switch cases in the parser, because `scanNext()` mutates `currentToken` via closure. The `token()` getter function defeats this narrowing cleanly, making the mutation semantics explicit without scattered type assertions.

### Error Accumulation

Stopping at the first error provides poor user experience for config file parsing. Accumulating all errors lets tooling show all issues at once, similar to how IDEs report multiple diagnostics. The parser continues past errors using skip-until recovery strategies.

### Tight Node Spans

Node spans previously ran to the offset of the next scanned token, silently absorbing trailing whitespace and comments into the node. That made spans useless for byte-minimal editing: replacing the last value before a closing `}` or `]` swallowed the intervening newline (issue #62). Tight spans make `offset`/`length` describe exactly the node's own text, which is what editors, `modify` and slice-based consumers expect.

### ignoreTrivia=false

The parser uses `ignoreTrivia=false` so it can see comment tokens. This is required to detect and report comments when `disallowComments` is true. The parser's `scanNext()` loop handles trivia tokens explicitly, skipping them during normal parsing.

### allowTrailingComma Defaults to true

Unlike Microsoft's jsonc-parser which defaults to false, this package defaults to true because the primary use case is parsing JSONC config files where trailing commas are standard.

---

## Related Documentation

- [Architecture](architecture.md) -- System overview and data flow
- [Scanner](scanner.md) -- Token stream that the parser consumes
- [Formatting](formatting.md) -- modify() relies on tight span semantics
- [Error Types](error-types.md) -- JsoncParseError and error detail structure
- [Effect Patterns](effect-patterns.md) -- Effect.sync wrapping pattern
