# jsonc-effect Documentation

## Guides

- [Getting Started](./getting-started.md) -- installation, first example, core concepts
- [API Reference](./api.md) -- all exports with signatures and descriptions
- [Examples](./examples.md) -- real-world usage patterns

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
