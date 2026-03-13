# jsonc-effect

[![npm version](https://img.shields.io/npm/v/jsonc-effect)](https://www.npmjs.com/package/jsonc-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

Pure [Effect](https://effect.website) JSONC (JSON with Comments) parser with no external parser dependencies. Scanner, parser, AST, and formatting are all implemented natively.

## Features

- **Effect-native** -- typed errors, Schema integration, and composable pipelines
- **Zero parser dependencies** -- `effect` is the sole runtime dependency
- **Schema integration** -- parse JSONC strings directly into validated types
- **Full toolchain** -- scanner, parser, AST navigation, visitor stream, formatting, and modification
- **Equality comparisons** -- compare JSONC documents semantically, ignoring comments, formatting, and key ordering
- **Safe by default** -- returns `unknown` (not `any`) and `Option` (not `undefined`)

## Installation

```bash
npm install jsonc-effect effect
```

## Quick Start

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

For API reference, advanced usage, and examples, see [docs](./docs/README.md).

## License

[MIT](./LICENSE)
