# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

Pure Effect-TS implementation of a JSONC (JSON with Comments) parser. No
external parser dependencies — scanner, parser, AST, and formatting are all
implemented natively in Effect. The only runtime dependency is `effect`.

- **npm package**: `jsonc-effect`
- **GitHub package**: `@spencerbeggs/jsonc-effect`
- **Reference**: Microsoft's `jsonc-parser` (MIT) as design reference, not dependency
- **Roadmap**: GitHub Issues #1-#9 (all closed)

## Project Status

All implementation phases complete. GitHub Issues #1-#9 all closed.
Polish improvements done: lazy streaming, Function.dual, typed errors,
JSDoc examples, README enhancements.

- **Tests**: 199 passing
- **Coverage**: 87.83% statements, 81.68% branches, 98.92% functions
- **Branch**: `feat/implementation` (pushed, ready for PR)

For architecture details:
@./.claude/design-docs/jsonc-effect.md

### Key Design Decisions

- Pure functions (not services) — parsing is synchronous and stateless
- `Data.TaggedError` with `*Base` exports for api-extractor DTS compatibility
- `Schema.Class` for structural equality on tokens, nodes, options
- String literals for token types (not numeric enums)
- `allowTrailingComma` defaults to `true`
- Platform independent — no `node:` imports anywhere

### Source Structure

```text
src/
├── errors.ts              # JsoncParseError, JsoncNodeNotFoundError, JsoncModificationError
├── schemas.ts             # Token types, AST node types, parse/formatting options
├── scanner.ts             # Lexer: string → token stream
├── parse.ts               # parse(), parseTree(), stripComments()
├── schema-integration.ts  # JsoncFromString, makeJsoncFromString, makeJsoncSchema
├── ast.ts                 # findNode, findNodeAtOffset, getNodePath, getNodeValue
├── visitor.ts             # visit(), visitCollect(), JsoncVisitorEvent stream API
├── format.ts              # format(), modify(), applyEdits(), formatAndApply()
└── index.ts               # Barrel exports
```

## Commands

### Development

```bash
pnpm run lint              # Check code with Biome
pnpm run lint:fix          # Auto-fix lint issues
pnpm run typecheck         # Type-check all workspaces via Turbo
pnpm run test              # Run all tests
pnpm run test:watch        # Run tests in watch mode
pnpm run test:coverage     # Run tests with coverage report
```

### Building

```bash
pnpm run build             # Build all packages (dev + prod)
pnpm run build:dev         # Build development output only
pnpm run build:prod        # Build production/npm output only
```

### Running a Single Test

```bash
# Run a specific test file
pnpm vitest run src/index.test.ts
```

## Architecture

### Structure

- **Package Manager**: pnpm with workspaces
- **Build Orchestration**: Turbo for caching and task dependencies
- **Single package**: Source in `src/`, configs in `lib/configs/`

### Package Build Pipeline

Each package uses Rslib with dual output:

1. `dist/dev/` - Development build with source maps
2. `dist/npm/` - Production build for npm publishing

Turbo tasks define dependencies: `typecheck` depends on `build` completing first.

### Code Quality

- **Biome**: Unified linting and formatting (replaces ESLint + Prettier)
- **Commitlint**: Enforces conventional commits with DCO signoff
- **Husky Hooks**:
  - `pre-commit`: Runs lint-staged
  - `commit-msg`: Validates commit message format
  - `pre-push`: Runs tests for affected packages

### TypeScript Configuration

- Composite builds with project references
- Strict mode enabled
- ES2022/ES2023 targets
- Import extensions required (`.js` for ESM)

### Testing

- **Framework**: Vitest with v8 coverage
- **Pool**: Uses forks (not threads) for Effect-TS compatibility
- **Config**: `vitest.config.ts` supports project-based filtering via
  `--project` flag

## Conventions

### Imports

- Use `.js` extensions for relative imports (ESM requirement)
- Use `node:` protocol for Node.js built-ins
- Separate type imports: `import type { Foo } from './bar.js'`

### Commits

All commits require:

1. Conventional commit format (feat, fix, chore, etc.)
2. DCO signoff: `Signed-off-by: Name <email>`

### Publishing

Packages publish to both GitHub Packages and npm with provenance.
