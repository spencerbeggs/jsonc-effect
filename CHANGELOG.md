# jsonc-effect

## 0.3.0

### Documentation

* [`2ce67b0`](https://github.com/spencerbeggs/jsonc-effect/commit/2ce67b016e941e2c41e40e2098e93c0bc6c1c841) Disambiguated all `{@link}` references to symbols that have both a value and a
  type declaration (`JsoncPath`, `JsoncSyntaxKind`, `JsoncScanError`,
  `JsoncParseErrorCode`, `JsoncSegment`, `JsoncNodeType`). Each reference now
  carries an explicit TSDoc member selector — e.g. `{@link (JsoncPath:type)}` —
  so API Extractor resolves them cleanly and generated documentation links point
  at the intended declaration.

### Build System

* [`2ce67b0`](https://github.com/spencerbeggs/jsonc-effect/commit/2ce67b016e941e2c41e40e2098e93c0bc6c1c841) Migrated the build entry point to the `@savvy-web/bundler` v1.1 `build()` API,
  replacing the previous `defineBuild`/`runBuild` pair. The API Extractor pass now
  runs with zero unsuppressed warnings; the only remaining suppression is the
  sanctioned `ae-forgotten-export` rule for Effect's `Context.Tag` synthetic
  `_base` classes, which cannot be exported or release-tagged from source.

Also pins the typecheck toolchain by adding `@types/node`, `typescript`, and
`@typescript/native-preview` as explicit `catalog:silk` devDependencies rather
than relying on transitive resolution.

### Dependencies

* [`2ce67b0`](https://github.com/spencerbeggs/jsonc-effect/commit/2ce67b016e941e2c41e40e2098e93c0bc6c1c841) | Dependency | Type | Action | From | To |
  \| :------------------- | :------------ | :------ | :---- | :---- |
  \| @savvy-web/bundler | devDependency | updated | 1.0.1 | 1.1.0 |
  \| @vitest-agent/plugin | devDependency | updated | 1.1.2 | 1.1.3 |

## 0.2.1

### Other

* [`f25261e`](https://github.com/spencerbeggs/jsonc-effect/commit/f25261e187e822f4bece453bc88d92a10b327ddd) Aligns with new test harness

## 0.2.0

### Features

* [`d9b89b3`](https://github.com/spencerbeggs/jsonc-effect/commit/d9b89b3ff1032c8b70286f862b2e4b343170b738) Add `equals` and `equalsValue` functions for semantic JSONC document equality comparisons. Both support `Function.dual` for data-first and pipeline usage. Compares parsed values ignoring comments, whitespace, formatting, and object key ordering.

## 0.1.0

### Features

Pure Effect-TS JSONC parser with zero external parser dependencies. Only runtime dependency is `effect`.

* Full JSONC scanner and recursive descent parser with `parse()`, `parseTree()`, and `stripComments()` supporting line comments (`//`), block comments (`/* */`), and trailing commas
* Schema integration with `JsoncFromString`, `makeJsoncFromString(options?)`, and `makeJsoncSchema(schema, options?)` for end-to-end typed JSONC parsing
* AST navigation with `findNode`, `findNodeAtOffset`, `getNodePath`, and `getNodeValue` — all supporting `Function.dual` (data-first and data-last)
* Formatting and modification with `format`, `modify`, `applyEdits`, and `formatAndApply` — all supporting `Function.dual`
* Lazy generator-based visitor streaming with `visit(text, options?)` returning `Stream<JsoncVisitorEvent>` and `visitCollect` for filtered collection across 9 discriminated event types
* Typed errors (`JsoncParseError`, `JsoncNodeNotFoundError`, `JsoncModificationError`) with `JsoncError` union for exhaustive `catchTags` handling
* Returns `unknown` instead of `any`, uses `Option` for missing values, and defaults `allowTrailingComma` to `true` matching real-world JSONC usage
