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

# Formatting and Modification

Compute edit operations for JSONC documents without mutation -- format, modify, and apply edits
as a pure data pipeline.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [Related Documentation](#related-documentation)

---

## Overview

The formatting module (`format.ts`) provides functions for formatting JSONC documents and computing
document modifications. All operations produce arrays of `JsoncEdit` objects rather than mutating
text directly, fitting naturally into Effect's functional style.

**When to reference this document:**

- When formatting JSONC documents
- When modifying values at specific paths
- When applying computed edits to source text
- When implementing editor-like document transformations

---

## Current State

### Exports

| Function | Signature | Description |
| :------- | :-------- | :---------- |
| `format` | `(text, range?, options?) => Effect<JsoncEdit[]>` | Compute formatting edits |
| `applyEdits` | dual: `(text, edits) => Effect<string>` | Apply edits to text |
| `formatAndApply` | `(text, range?, options?) => Effect<string>` | Format in one step |
| `modify` | dual: `(text, path, value, options?) => Effect<JsoncEdit[], JsoncModificationError>` | Compute modification edits |

### Implementation Details

**Format:**

- Uses `createScanner(text, false)` to walk all tokens, computing indentation edits by comparing
  gap text between tokens against expected whitespace
- Supports range formatting (format only a portion of the document)
- `keepLines` mode preserves existing line breaks
- Configurable `tabSize`, `insertSpaces`, `eol`, and `insertFinalNewline`

**Modify:**

- Uses `createScanner(text, true)` (ignoreTrivia=true) to navigate to the target path
- Computes replacement, insertion, or removal edits based on the target value
- Supports `Function.dual` with arity detection via `typeof args[0] === "string" && Array.isArray(args[1])`
- Returns `Effect<JsoncEdit[], JsoncModificationError>` when the path cannot be navigated

**Apply Edits:**

- Applies edits in reverse offset order to avoid index shifting
- Supports `Function.dual` for both `applyEdits(text, edits)` and `pipe(text, applyEdits(edits))`

**Format and Apply:**

- Convenience function composing `format` then `applyEdits` via `Effect.flatMap`

### Formatting Options

| Option | Default | Description |
| :----- | :------ | :---------- |
| `tabSize` | `2` | Number of spaces per indentation level |
| `insertSpaces` | `true` | Use spaces instead of tabs |
| `eol` | `"\n"` | End-of-line character |
| `insertFinalNewline` | `false` | Add trailing newline |
| `keepLines` | `false` | Preserve existing line breaks |

### Usage Example

```typescript
import { modify, applyEdits } from "jsonc-effect"
import { Effect, pipe } from "effect"

const input = '{ "version": 1 }'

// Data-last pipeline
const updated = pipe(
  input,
  modify(["version"], 2),
  Effect.flatMap((edits) => applyEdits(input, edits)),
  Effect.runSync,
)
// => '{ "version": 2 }'
```

---

## Rationale

### Edit Arrays Instead of Mutation

Producing `JsoncEdit[]` rather than mutated strings enables:

- Composing edits before applying them
- Inspecting what changes will be made
- Applying edits in the correct order (reverse offset)
- Natural fit with Effect's functional programming model

### Separate Scanner Modes

Format uses `ignoreTrivia=false` to analyze whitespace gaps between tokens. Modify uses
`ignoreTrivia=true` for simplified path navigation. This separation keeps each function focused
on its specific concern.

---

## Related Documentation

- [Architecture](architecture.md) -- System overview and format pipeline diagram
- [Scanner](scanner.md) -- Token stream used for edit computation
- [Effect Patterns](effect-patterns.md) -- Function.dual pattern details
