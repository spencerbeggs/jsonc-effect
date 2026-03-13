---
status: current
module: jsonc-effect
category: architecture
created: 2026-03-12
updated: 2026-03-13
last-synced: 2026-03-13
completeness: 95
related:
  - architecture.md
  - parser.md
  - effect-patterns.md
dependencies: []
---

# Error Types

Typed error classes for all failure modes across parsing, navigation, and modification.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [Related Documentation](#related-documentation)

---

## Overview

The error module (`errors.ts`) defines three error classes using Effect's `Data.TaggedError`
pattern, plus a union type for exhaustive error handling. Each error type has a `*Base` export
for api-extractor DTS compatibility.

**When to reference this document:**

- When adding new error types
- When implementing error handling for JSONC operations
- When using `catchTag` or `catchTags` with JSONC errors

---

## Current State

### Error Classes

| Error | Tag | Raised By | Description |
| :---- | :-- | :-------- | :---------- |
| `JsoncParseError` | `"JsoncParseError"` | `parse`, `parseTree` | Parse failure with array of error details |
| `JsoncNodeNotFoundError` | `"JsoncNodeNotFoundError"` | AST navigation | Node not found at path |
| `JsoncModificationError` | `"JsoncModificationError"` | `modify` | Edit computation failure |

### JsoncParseError

Aggregates multiple `JsoncParseErrorDetail` instances, each containing:

- `code` -- One of 16 `JsoncParseErrorCode` values (e.g., `"InvalidSymbol"`, `"ColonExpected"`)
- `message` -- Human-readable error description
- `offset` -- Character offset in source text
- `length` -- Length of the error span
- `startLine` -- Line number (0-based)
- `startCharacter` -- Character position within line (0-based)

The `message` getter pluralizes automatically:

- "JSONC parse failed with 1 error: ..."
- "JSONC parse failed with 3 errors: ...; ...; ..."

### Parse Error Codes

```text
InvalidSymbol, InvalidNumberFormat, PropertyNameExpected, ValueExpected,
ColonExpected, CommaExpected, CloseBraceExpected, CloseBracketExpected,
EndOfFileExpected, InvalidCommentToken, UnexpectedEndOfComment,
UnexpectedEndOfString, UnexpectedEndOfNumber, InvalidUnicode,
InvalidEscapeCharacter, InvalidCharacter
```

### JsoncError Union

```typescript
type JsoncError = JsoncParseError | JsoncNodeNotFoundError | JsoncModificationError
```

Enables exhaustive `catchTags`:

```typescript
Effect.catchTags({
  JsoncParseError: (e) => ...,
  JsoncModificationError: (e) => ...,
  JsoncNodeNotFoundError: (e) => ...,
})
```

### Base Exports

Each error has a `*Base` export:

```typescript
export const JsoncParseErrorBase = Data.TaggedError("JsoncParseError")
export class JsoncParseError extends JsoncParseErrorBase<{ ... }> { ... }
```

---

## Rationale

### Data.TaggedError

Effect's `Data.TaggedError` provides:

- `_tag` discriminant for `catchTag`/`catchTags` pattern matching
- Structural equality for testing
- Integration with Effect's error channel

### *Base Export Pattern

The `*Base` export (e.g., `JsoncParseErrorBase`) is required for api-extractor compatibility.
Without it, api-extractor cannot properly resolve the class hierarchy when generating `.d.ts`
rollup files. The base is marked `@internal` so it does not appear in public documentation.

### Error Accumulation

`JsoncParseError` aggregates an array of `JsoncParseErrorDetail` rather than representing a single
error. This supports the parser's error accumulation strategy -- collecting all errors and continuing
rather than stopping at the first.

---

## Related Documentation

- [Architecture](architecture.md) -- System overview
- [Parser](parser.md) -- Error accumulation in the parser
- [Effect Patterns](effect-patterns.md) -- Data.TaggedError pattern details
