# jsonc-effect

## 0.1.0

### Features

Pure Effect-TS JSONC parser with zero external parser dependencies. Only runtime dependency is `effect`.

- Full JSONC scanner and recursive descent parser with `parse()`, `parseTree()`, and `stripComments()` supporting line comments (`//`), block comments (`/* */`), and trailing commas
- Schema integration with `JsoncFromString`, `makeJsoncFromString(options?)`, and `makeJsoncSchema(schema, options?)` for end-to-end typed JSONC parsing
- AST navigation with `findNode`, `findNodeAtOffset`, `getNodePath`, and `getNodeValue` — all supporting `Function.dual` (data-first and data-last)
- Formatting and modification with `format`, `modify`, `applyEdits`, and `formatAndApply` — all supporting `Function.dual`
- Lazy generator-based visitor streaming with `visit(text, options?)` returning `Stream<JsoncVisitorEvent>` and `visitCollect` for filtered collection across 9 discriminated event types
- Typed errors (`JsoncParseError`, `JsoncNodeNotFoundError`, `JsoncModificationError`) with `JsoncError` union for exhaustive `catchTags` handling
- Returns `unknown` instead of `any`, uses `Option` for missing values, and defaults `allowTrailingComma` to `true` matching real-world JSONC usage
