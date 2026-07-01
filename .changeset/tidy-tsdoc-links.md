---
"jsonc-effect": minor
---

## Documentation

Disambiguated all `{@link}` references to symbols that have both a value and a
type declaration (`JsoncPath`, `JsoncSyntaxKind`, `JsoncScanError`,
`JsoncParseErrorCode`, `JsoncSegment`, `JsoncNodeType`). Each reference now
carries an explicit TSDoc member selector — e.g. `{@link (JsoncPath:type)}` —
so API Extractor resolves them cleanly and generated documentation links point
at the intended declaration.

## Build System

Migrated the build entry point to the `@savvy-web/bundler` v1.1 `build()` API,
replacing the previous `defineBuild`/`runBuild` pair. The API Extractor pass now
runs with zero unsuppressed warnings; the only remaining suppression is the
sanctioned `ae-forgotten-export` rule for Effect's `Context.Tag` synthetic
`_base` classes, which cannot be exported or release-tagged from source.

Also pins the typecheck toolchain by adding `@types/node`, `typescript`, and
`@typescript/native-preview` as explicit `catalog:silk` devDependencies rather
than relying on transitive resolution.

## Dependencies

| Dependency           | Type          | Action  | From  | To    |
| :------------------- | :------------ | :------ | :---- | :---- |
| @savvy-web/bundler   | devDependency | updated | 1.0.1 | 1.1.0 |
| @vitest-agent/plugin | devDependency | updated | 1.1.2 | 1.1.3 |
