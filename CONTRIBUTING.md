# Contributing to jsonc-effect

Thank you for your interest in contributing. This document provides guidelines
and instructions for development.

## Prerequisites

- Node.js 24.x
- pnpm 10.32.1

## Development Setup

```bash
# Clone the repository
git clone https://github.com/spencerbeggs/jsonc-effect.git
cd jsonc-effect

# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm run test
```

## Available Scripts

| Script | Description |
| ------ | ----------- |
| `pnpm run build` | Build all packages (dev + prod) |
| `pnpm run build:dev` | Build development output only |
| `pnpm run build:prod` | Build production/npm output only |
| `pnpm run test` | Run all tests |
| `pnpm run test:watch` | Run tests in watch mode |
| `pnpm run test:coverage` | Run tests with coverage report |
| `pnpm run lint` | Check code with Biome |
| `pnpm run lint:fix` | Auto-fix lint issues |
| `pnpm run typecheck` | Type-check via Turbo |

## Code Quality

This project uses:

- **Biome** for linting and formatting
- **Commitlint** for enforcing conventional commits
- **Husky** for Git hooks (pre-commit, commit-msg, pre-push)
- **TypeScript** in strict mode with ES2022+ targets

### Commit Format

All commits must follow [Conventional Commits](https://conventionalcommits.org)
and include a DCO signoff:

```text
feat: add new parser option

Signed-off-by: Your Name <your.email@example.com>
```

### Import Conventions

- Use `.js` extensions for relative imports (ESM requirement)
- Separate type imports: `import type { Foo } from './bar.js'`
- No `node:` built-in imports (this package is platform-independent)

## Testing

Tests use [Vitest](https://vitest.dev) with v8 coverage and the forks pool
for Effect-TS compatibility.

```bash
# Run all tests
pnpm run test

# Run a specific test file
pnpm vitest run src/index.test.ts

# Run tests with coverage
pnpm run test:coverage
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests: `pnpm run test`
5. Run linting: `pnpm run lint:fix`
6. Commit with conventional format and DCO signoff
7. Push and open a pull request

## License

By contributing, you agree that your contributions will be licensed under the
MIT License.
