# jsonc-effect

[![npm](https://img.shields.io/npm/v/jsonc-effect?label=npm&color=cb3837)](https://www.npmjs.com/package/jsonc-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-4caf50.svg)](https://opensource.org/licenses/MIT)
[![Node.js %3E%3D24.11.0](https://img.shields.io/badge/Node.js-%3E%3D24.11.0-5fa04e.svg)](https://nodejs.org/)
[![TypeScript 6.0](https://img.shields.io/badge/TypeScript-6.0-3178c6.svg)](https://www.typescriptlang.org/)

Pure [Effect](https://effect.website) JSONC (JSON with Comments) parser with no external parser dependencies. Scanner, parser, AST and formatting are all implemented natively.

## Features

- **Effect-native** -- typed errors, Schema integration and composable pipelines
- **Zero parser dependencies** -- `effect` is the sole runtime dependency
- **Schema integration** -- parse JSONC strings directly into validated types
- **Full toolchain** -- scanner, parser, AST navigation, visitor stream, formatting and modification
- **Byte-minimal edits** -- `modify` targets exactly the value's span, preserving surrounding whitespace and comments
- **Equality comparisons** -- compare JSONC documents semantically, ignoring comments, formatting and key ordering
- **Safe by default** -- returns `unknown` (not `any`) and `Option` (not `undefined`)

## Install

```bash
npm install jsonc-effect effect
# or
pnpm add jsonc-effect effect
```

## Quick start

```typescript
import { parse } from "jsonc-effect"
import { Effect } from "effect"

const result = Effect.runSync(
  parse('{ "key": 42, /* comment */ }')
)
// => { key: 42 }
```

Semantically compare two JSONC documents:

```typescript
import { equals } from "jsonc-effect"
import { Effect } from "effect"

// Semantically equal despite different formatting, comments, and key order
const same = Effect.runSync(
  equals(
    '{ "foo": 1, "bar": 2 }',
    '{ "bar": 2, /* comment */ "foo": 1 }'
  )
)
// => true
```

## FAQ

### Why does this module exist?

If you just need to parse JSONC into a JavaScript object, use [jsonc-parser](https://github.com/microsoft/node-jsonc-parser) or [Bun's native JSONC support](https://bun.sh/docs/api/utils#bunfile-json). They are faster and have no dependencies.

This library is for Effect-based programs that need deeper introspection and editing of JSONC documents: typed parse errors you can `catchTag`, Schema pipelines that validate JSONC strings into domain types, AST navigation, document modification and SAX-style visitor streams that are composable in Effect pipelines.

## Documentation

- [Getting started](./docs/01-getting-started.md) — installation, first example, core concepts
- [Examples](./docs/02-examples.md) — real-world usage patterns
- [API reference](./docs/03-api-reference.md) — all exports with signatures and descriptions

## License

[MIT](LICENSE)
