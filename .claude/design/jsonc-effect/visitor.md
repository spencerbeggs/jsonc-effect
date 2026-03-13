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
  - scanner.md
  - effect-patterns.md
dependencies:
  - scanner.md
---

# Visitor / Stream API

SAX-style event stream API for memory-efficient processing of JSONC documents without building
a full AST.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [Related Documentation](#related-documentation)

---

## Overview

The visitor module (`visitor.ts`) provides an event-driven API for processing JSONC documents.
Instead of building a complete AST in memory, it emits typed events as an Effect `Stream`, enabling
filtered and lazy processing of document structure.

**When to reference this document:**

- When processing large JSONC documents memory-efficiently
- When extracting specific values without full AST construction
- When building streaming JSONC processors

---

## Current State

### Exports

| Export | Type | Description |
| :----- | :--- | :---------- |
| `JsoncVisitorEvent` | discriminated union | 9 event types for document structure |
| `visit` | `(text, options?) => Stream<JsoncVisitorEvent>` | Stream of visitor events |
| `visitCollect` | `(text, predicate, options?) => Effect<A[]>` | Collect filtered events |

### Event Types

| Event | Fields | Emitted When |
| :---- | :----- | :----------- |
| `ObjectBegin` | offset, length, path | `{` encountered |
| `ObjectEnd` | offset, length | `}` encountered |
| `ObjectProperty` | property, offset, length, path | Property key parsed |
| `ArrayBegin` | offset, length, path | `[` encountered |
| `ArrayEnd` | offset, length | `]` encountered |
| `LiteralValue` | value, offset, length, path | String, number, boolean, or null |
| `Separator` | character, offset, length | `,` or `:` |
| `Comment` | offset, length | Line or block comment |
| `Error` | code, offset, length | Parse error encountered |

### Implementation Details

- Events carry offset, length, and path context for downstream consumers
- Uses `createScanner(text, false)` (ignoreTrivia=false) to see all tokens including comments
- Handles trailing commas, error recovery, and `disallowComments` option
- Path tracking maintains a mutable array pushed/popped during object and array traversal
- `visit` collects events via the scanner and emits them as `Stream.fromIterable`
- `visitCollect` chains `Stream.filter(predicate)` with `Stream.runCollect` and
  `Chunk.toReadonlyArray`

### Usage Example

```typescript
import { visit, type JsoncVisitorEvent } from "jsonc-effect"
import { Effect, Stream, Chunk } from "effect"

const literals = Effect.runSync(
  visit('{ "a": 1, "b": [2, 3] }').pipe(
    Stream.filter(
      (e): e is Extract<JsoncVisitorEvent, { _tag: "LiteralValue" }> =>
        e._tag === "LiteralValue"
    ),
    Stream.runCollect,
    Effect.map(Chunk.toReadonlyArray),
  )
)
```

---

## Rationale

### Stream.fromIterable

Wrapping collected visitor events in `Stream.fromIterable` enables downstream consumers to use
the full `Stream` combinator API (`filter`, `map`, `take`, `runCollect`, etc.). This is more
composable than a callback-based visitor pattern.

### Event-Driven vs AST

The visitor API is useful when you need to process a document without building the full AST in
memory, or when you only need specific events (e.g., all property names, all literal values).
The `visitCollect` helper provides a convenient one-shot API for the common case.

---

## Related Documentation

- [Architecture](architecture.md) -- System overview and visitor pipeline diagram
- [Scanner](scanner.md) -- Token stream that drives visitor events
- [Effect Patterns](effect-patterns.md) -- Stream.fromIterable pattern details
