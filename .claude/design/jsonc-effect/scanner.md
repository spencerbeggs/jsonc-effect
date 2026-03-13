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
dependencies: []
---

# Scanner

Lexer that converts a JSONC string into a stream of tokens via a stateful cursor interface.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [Token Types](#token-types)
5. [Related Documentation](#related-documentation)

---

## Overview

The scanner (`scanner.ts`) is the foundation of the parsing pipeline. It performs character-level
scanning of JSONC input text, producing typed tokens that the parser, visitor, and formatter all
consume. The scanner is a closure-based state machine -- `createScanner` returns an interface over
closed-over mutable state, encapsulating position tracking without requiring a class.

**When to reference this document:**

- When modifying token scanning logic
- When adding new token types
- When debugging tokenization issues
- When understanding how `ignoreTrivia` affects downstream consumers

---

## Current State

### Interface

`JsoncScanner` exposes these methods:

| Method | Return Type | Description |
| :----- | :---------- | :---------- |
| `scan()` | `JsoncSyntaxKind` | Advance to next token, return its kind |
| `getToken()` | `JsoncSyntaxKind` | Get current token kind |
| `getTokenValue()` | `string` | Get string value of current token |
| `getTokenOffset()` | `number` | Get character offset of current token |
| `getTokenLength()` | `number` | Get length of current token |
| `getTokenStartLine()` | `number` | Get line number of token start |
| `getTokenStartCharacter()` | `number` | Get character position within line |
| `getTokenError()` | `JsoncScanError` | Get scan error for current token |
| `getPosition()` | `number` | Get current cursor position |
| `setPosition(pos)` | `void` | Set cursor position |

### Factory

```typescript
createScanner(text: string, ignoreTrivia?: boolean): JsoncScanner
```

The `ignoreTrivia` parameter controls whether whitespace, line breaks, and comments are skipped
or emitted as tokens:

- `ignoreTrivia=true` -- Used by `stripComments()` and `modify()`. Only structural tokens emitted.
- `ignoreTrivia=false` -- Used by `parse()`, `parseTree()`, `visit()`, and `format()`. All tokens
  emitted, allowing the parser to detect comments for `disallowComments` and the formatter to
  analyze whitespace.

### Implementation Details

- Character-level scanning using `charCodeAt()` for performance
- Handles line comments (`//`), block comments (`/* */`), strings with escapes, numbers with
  fractional and exponent parts
- Reports scan errors via `getTokenError()` without throwing
- Tracks line numbers and character positions for error reporting
- Unicode escape sequences (`\uXXXX`) are decoded during string scanning

---

## Rationale

### Closure-Based State Machine

The scanner uses a factory function that returns an object with methods closing over shared mutable
variables (position, current token, line tracking). This encapsulates state without requiring a
class, which is more idiomatic in the Effect ecosystem and produces a clean, focused API surface.

### ignoreTrivia Parameter

The parser needs `ignoreTrivia=false` to see comment tokens (required for the `disallowComments`
option). The formatter also needs `ignoreTrivia=false` to analyze whitespace gaps between tokens.
Meanwhile, `stripComments` and `modify` use `ignoreTrivia=true` for simplified token navigation.

---

## Token Types

The scanner produces tokens with these `JsoncSyntaxKind` values:

| Kind | Example | Notes |
| :--- | :------ | :---- |
| OpenBrace | `{` | Object start |
| CloseBrace | `}` | Object end |
| OpenBracket | `[` | Array start |
| CloseBracket | `]` | Array end |
| Comma | `,` | Element separator |
| Colon | `:` | Key-value separator |
| String | `"hello"` | Value is unescaped content |
| Number | `42`, `-3.14e2` | Integer, float, or scientific |
| True | `true` | Boolean literal |
| False | `false` | Boolean literal |
| Null | `null` | Null literal |
| LineComment | `// text` | Skipped by parser unless disallowComments |
| BlockComment | `/* text */` | Skipped by parser unless disallowComments |
| LineBreak | `\n`, `\r\n` | Only emitted when ignoreTrivia=false |
| Trivia | spaces, tabs | Only emitted when ignoreTrivia=false |
| Unknown | anything else | Produces InvalidCharacter or InvalidSymbol error |
| EOF | end of input | Signals end of token stream |

### Scan Error Codes

| Code | Trigger |
| :--- | :------ |
| None | No error |
| UnexpectedEndOfComment | Unterminated `/* ... */` |
| UnexpectedEndOfString | Unterminated string literal |
| UnexpectedEndOfNumber | Truncated number (e.g., `1.` at EOF) |
| InvalidUnicode | Invalid `\uXXXX` sequence |
| InvalidEscapeCharacter | Unknown escape like `\q` |
| InvalidCharacter | Unrecognized character |
| InvalidSymbol | Unrecognized keyword |

---

## Related Documentation

- [Architecture](architecture.md) -- System overview and data flow diagrams
- [Parser](parser.md) -- How the parser consumes scanner tokens
- [Effect Patterns](effect-patterns.md) -- Schema.Literal for token types
