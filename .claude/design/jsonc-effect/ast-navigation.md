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
dependencies:
  - parser.md
---

# AST Navigation

Pipe-friendly traversal utilities for `JsoncNode` trees produced by `parseTree()`.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [Related Documentation](#related-documentation)

---

## Overview

The AST navigation module (`ast.ts`) provides functions for traversing and querying the parse tree
produced by `parseTree()`. All functions support `Function.dual` for both data-first and data-last
calling conventions, making them composable in Effect pipelines.

**When to reference this document:**

- When navigating parsed AST nodes
- When extracting values from specific paths
- When implementing offset-based features (e.g., editor integration)

---

## Current State

### Exports

| Function | Signature | Description |
| :------- | :-------- | :---------- |
| `findNode` | dual: `(root, path) => Effect<Option<JsoncNode>>` | Locate node at a JSON path |
| `findNodeAtOffset` | dual: `(root, offset) => Effect<Option<JsoncNode>>` | Find innermost node at character offset |
| `getNodePath` | dual: `(root, offset) => Effect<Option<JsoncPath>>` | Compute path to node at offset |
| `getNodeValue` | `(node) => Effect<unknown>` | Reconstruct JavaScript value from AST subtree |

### Implementation Details

- All dual functions use `Function.dual(2, ...)` enabling both `findNode(root, path)` and
  `pipe(root, findNode(path))`
- `findNode` navigates property names (strings) and array indices (numbers) in the path
- `findNodeAtOffset` performs depth-first narrowing to the most specific node covering the offset
- `getNodePath` computes the JSON path by walking the AST to find the node at the given offset
- `getNodeValue` recursively evaluates the AST subtree, reconstructing objects, arrays, and
  primitive values

### Usage Example

```typescript
import { Effect, Option, pipe } from "effect"
import { parseTree, findNode, getNodeValue } from "jsonc-effect"

// Data-first
const node = Effect.gen(function* () {
  const root = yield* parseTree('{ "a": { "b": 1 } }')
  if (Option.isNone(root)) return Option.none()
  return yield* findNode(root.value, ["a", "b"])
})

// Data-last (pipeline)
const value = pipe(
  root,
  findNode(["a", "b"]),
  Effect.flatMap(Option.match({
    onNone: () => Effect.succeed(undefined),
    onSome: (node) => getNodeValue(node),
  })),
)
```

---

## Rationale

### Function.dual

`Function.dual` enables both calling conventions without maintaining separate implementations.
The arity argument (2) tells Effect how many arguments the data-first form expects. This is
idiomatic Effect-TS and allows AST navigation to integrate naturally with `pipe` and `Effect.gen`.

### Option.Option Return Types

Navigation functions return `Option<JsoncNode>` rather than throwing or returning `undefined`,
making the "not found" case explicit and composable with Effect's `Option` combinators.

---

## Related Documentation

- [Architecture](architecture.md) -- System overview and AST navigation pipeline diagram
- [Parser](parser.md) -- parseTree() that produces the AST
- [Effect Patterns](effect-patterns.md) -- Function.dual pattern details
