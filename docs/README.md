# jsonc-effect documentation

Pure [Effect](https://effect.website) JSONC (JSON with Comments) parser with no external parser dependencies. Scanner, parser, AST and formatting are all implemented natively.

## Install

```bash
npm install jsonc-effect effect
# or
pnpm add jsonc-effect effect
```

## Guides

- [Getting started](./01-getting-started.md) — installation, first example, core concepts
- [Examples](./02-examples.md) — real-world usage patterns
- [API reference](./03-api-reference.md) — all exports with signatures and descriptions

## Overview

jsonc-effect provides a complete JSONC toolchain built on Effect-TS:

| Module | Purpose |
| --- | --- |
| Parser | `parse`, `parseTree`, `stripComments` |
| Scanner | `createScanner` for low-level tokenization |
| Schema Integration | `makeJsoncSchema` for typed config parsing |
| AST Navigation | `findNode`, `findNodeAtOffset`, `getNodePath`, `getNodeValue` |
| Visitor | `visit`, `visitCollect` for SAX-style event streaming |
| Formatting | `format`, `modify`, `applyEdits`, `formatAndApply` |
| Equality | `equals`, `equalsValue` for semantic document comparison |
