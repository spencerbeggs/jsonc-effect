---
status: current
module: jsonc-effect
category: architecture
created: 2026-03-13
updated: 2026-03-13
last-synced: 2026-03-13
completeness: 95
related:
  - architecture.md
  - parser.md
  - effect-patterns.md
  - error-types.md
dependencies:
  - parser.md
---

# Equality

Semantic equality comparisons for JSONC documents, ignoring comments, whitespace, formatting, and
object key ordering.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [Related Documentation](#related-documentation)

---

## Overview

The equality module (`equality.ts`) provides functions for comparing JSONC documents by their
parsed semantic values rather than their textual representation. Two JSONC strings that parse to
the same JavaScript value are considered equal, regardless of comments, whitespace, formatting,
or the ordering of object keys.

The module exports two public functions (`equals` and `equalsValue`) and uses one internal helper
(`deepEqual`). Both public functions return `Effect.Effect<boolean, JsoncParseError>` and support
`Function.dual` for data-first and data-last calling conventions.

**When to reference this document:**

- When comparing JSONC documents for equivalence
- When testing whether a JSONC string matches an expected JavaScript value
- When working with semantic diffing or deduplication of JSONC content

---

## Current State

### Exports

| Function | Signature | Description |
| :------- | :-------- | :---------- |
| `equals` | dual: `(self: string, that: string) => Effect<boolean, JsoncParseError>` | Compare two JSONC strings for semantic equality |
| `equalsValue` | dual: `(self: string, value: unknown) => Effect<boolean, JsoncParseError>` | Compare a JSONC string against a JavaScript value |

### Internal Functions

| Function | Signature | Description |
| :------- | :-------- | :---------- |
| `deepEqual` | `(a: unknown, b: unknown) => boolean` | Deep-compare two values for structural equality |

### Implementation Details

#### `deepEqual` (internal)

A recursive comparator that handles all JSON-compatible types:

- **Identical references or equal primitives:** Uses strict equality (`===`) as a fast path
- **Null:** Explicitly checked since `typeof null === "object"` in JavaScript
- **Type mismatch:** Returns `false` if `typeof a !== typeof b`
- **Arrays:** Order-sensitive; compared element-by-element with recursive `deepEqual` calls;
  length must match
- **Objects:** Key-order independent; compared by checking that both objects have the same set of
  keys and each key's value passes recursive `deepEqual`; key count must match
- **Fallback:** Returns `false` for any remaining mismatches (e.g., functions, symbols)

The function is intentionally simple and handles only JSON-compatible types (objects, arrays,
strings, numbers, booleans, null). It does not handle `Date`, `Map`, `Set`, or other non-JSON types
since `parse()` only produces JSON-compatible values.

#### `equals`

Parses both JSONC strings using `parse()`, then deep-compares the results:

```typescript
Effect.map(Effect.all([parse(self), parse(that)]), ([a, b]) => deepEqual(a, b))
```

Uses `Effect.all` to parse both inputs, which means both strings must parse successfully for the
comparison to proceed. If either string contains invalid JSONC, the effect fails with
`JsoncParseError`.

#### `equalsValue`

Parses a single JSONC string and compares it against a provided JavaScript value:

```typescript
Effect.map(parse(self), (parsed) => deepEqual(parsed, value))
```

Only one parse operation is needed since the comparison value is already a JavaScript value.
The effect fails with `JsoncParseError` only if the JSONC string is invalid.

### Error Handling

Both functions propagate `JsoncParseError` from the underlying `parse()` calls. No new error
types are introduced. If `equals` is given two invalid JSONC strings, `Effect.all` will fail
with the error from the first string (short-circuit evaluation).

### Usage Examples

```typescript
import { Effect } from "effect"
import { equals, equalsValue } from "jsonc-effect"

// Data-first: compare two JSONC strings
Effect.runSync(equals('{"a": 1, "b": 2}', '{"b": 2, "a": 1}')) // true

// Data-first: compare JSONC string to JS value
Effect.runSync(equalsValue('{"port": 3000}', { port: 3000 })) // true

// Comments and whitespace are ignored
Effect.runSync(equals(
  '{ /* comment */ "key": 42 }',
  '{"key":42}'
)) // true

// Array order is significant
Effect.runSync(equals('[1, 2, 3]', '[3, 2, 1]')) // false

// Data-last (pipeline)
const result = pipe(
  '{"a": 1}',
  equals('{"a": 1}'),
  Effect.runSync,
) // true

// Error propagation
const failing = equals('{ invalid }', '{}')
// Effect fails with JsoncParseError
```

---

## Rationale

### Pure Functions, No Class Wrapper

Following the established pattern in this codebase, equality comparisons are implemented as pure
functions rather than methods on a class. Parsing is synchronous and stateless, so there is no
need for a service or class wrapper.

### Function.dual

Both `equals` and `equalsValue` use `Function.dual(2, ...)` to support data-first and data-last
calling conventions. This is idiomatic Effect-TS and allows the functions to integrate naturally
with `pipe` and `Effect.gen`. The arity argument (2) tells Effect how many arguments the data-first
form expects.

### Internal deepEqual

The `deepEqual` function is not exported because it operates on plain JavaScript values, not JSONC
strings. Exposing it would blur the module's responsibility boundary. Users who need generic deep
equality should use Effect's `Equal` trait or a dedicated utility.

### Key-Order Independence

Object comparison is key-order independent because JSONC documents (like JSON) do not define key
ordering as semantically meaningful. Two configuration files with the same keys and values but
different ordering should be considered equal.

### Array Order Significance

Array comparison is order-sensitive because JSON arrays are ordered sequences. Reordering array
elements changes the semantic meaning of the document.

---

## Related Documentation

- [Architecture](architecture.md) -- System overview and module summary
- [Parser](parser.md) -- `parse()` function that equality depends on
- [Effect Patterns](effect-patterns.md) -- Function.dual pattern details
- [Error Types](error-types.md) -- JsoncParseError propagation
