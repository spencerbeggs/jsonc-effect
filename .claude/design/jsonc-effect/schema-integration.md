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

# Schema Integration

Transform JSONC strings directly into validated Schema types via `Schema.transformOrFail` pipelines,
enabling typed config file parsing in a single step.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [Related Documentation](#related-documentation)

---

## Overview

The schema integration module (`schema-integration.ts`) bridges JSONC parsing with Effect's Schema
system. It provides composable schemas that decode JSONC strings into validated domain types,
enabling end-to-end pipelines: JSONC string to unknown to typed domain object.

**When to reference this document:**

- When building typed config file parsers
- When composing JSONC parsing with Schema validation
- When customizing parse options in Schema pipelines

---

## Current State

### Exports

| Export | Type | Description |
| :----- | :--- | :---------- |
| `JsoncFromString` | `Schema<unknown, string>` | Default JSONC-to-unknown schema |
| `makeJsoncFromString` | `(options?) => Schema<unknown, string>` | Factory with custom parse options |
| `makeJsoncSchema` | `(targetSchema, options?) => Schema<A, string>` | Composed JSONC + target schema |

### Pipeline

```text
JSONC string
     |
     v
Schema.transformOrFail  (makeJsoncFromString)
     |
parse(input)
     |
     v
unknown value
     |
Schema.compose  (makeJsoncSchema)
     |
     v
typed A value
```

### Implementation Details

- `transformOrFail` decode direction calls the core `parse()` function, mapping `JsoncParseError`
  to `ParseResult.Type` for Schema-compatible error reporting
- Encode direction serializes values back to JSON via `JSON.stringify` (comments are not preserved
  during round-trip)
- `makeJsoncSchema` uses `Schema.compose` to chain JSONC parsing with downstream validation
- `JsoncFromString` is a pre-built instance of `makeJsoncFromString()` with default options

### Usage Example

```typescript
import { Schema } from "effect"
import { makeJsoncSchema } from "jsonc-effect"

const MyConfig = Schema.Struct({
  name: Schema.String,
  version: Schema.Number,
})

const MyConfigFromJsonc = makeJsoncSchema(MyConfig)
const config = Schema.decodeUnknownSync(MyConfigFromJsonc)(jsoncText)
// config: { name: string, version: number }
```

---

## Rationale

### Schema.transformOrFail

`Schema.transformOrFail` is the natural Effect pattern for fallible transformations. The decode
direction calls `parse()` and maps the typed `JsoncParseError` into `ParseResult.Type`, keeping
the error channel compatible with Schema's decode pipeline. This enables JSONC parse errors to
surface through `Schema.decodeUnknown` and `Schema.decodeUnknownSync` with proper error messages.

### Schema.compose for End-to-End Pipelines

`makeJsoncSchema` composes `makeJsoncFromString` with any target schema in one step, avoiding
the need for consumers to manually chain `Schema.compose`. This provides a clean, single-call API
for the common use case of parsing typed config files from JSONC strings.

---

## Related Documentation

- [Architecture](architecture.md) -- System overview and pipeline diagrams
- [Parser](parser.md) -- Core parse() function called by transformOrFail
- [Effect Patterns](effect-patterns.md) -- Schema.transformOrFail pattern details
