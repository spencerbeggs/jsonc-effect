# API Reference

## Parser

### `parse(text, options?)`

Parse a JSONC string to a JavaScript value.

- **Returns:** `Effect<unknown, JsoncParseError>`

### `parseTree(text, options?)`

Parse a JSONC string to an AST.

- **Returns:** `Effect<Option<JsoncNode>, JsoncParseError>`

### `stripComments(text, replaceCh?)`

Remove comments from JSONC text, producing valid JSON.

- **Returns:** `Effect<string>`

## Scanner

### `createScanner(text, ignoreTrivia?)`

Create a low-level token scanner.

- **Returns:** `JsoncScanner`

The scanner produces tokens of type `JsoncSyntaxKind`: `OpenBrace`,
`CloseBrace`, `OpenBracket`, `CloseBracket`, `Comma`, `Colon`, `String`,
`Number`, `True`, `False`, `Null`, `LineComment`, `BlockComment`,
`LineBreak`, `Trivia`, `Unknown`, `EOF`.

## Schema Integration

### `JsoncFromString`

A `Schema<unknown, string>` that decodes a JSONC string to an unknown value.

### `makeJsoncFromString(options?)`

Factory for `JsoncFromString` with custom parse options.

- **Returns:** `Schema<unknown, string>`

### `makeJsoncSchema(schema, options?)`

Compose JSONC parsing with a target Schema for end-to-end typed parsing.

- **Returns:** `Schema<A, string>`

## AST Navigation

All navigation functions support `Function.dual` (data-first and data-last
calling conventions).

### `findNode(root, path)`

Find node at a JSON path.

- **Returns:** `Effect<Option<JsoncNode>>`

### `findNodeAtOffset(root, offset)`

Find innermost node at a character offset.

- **Returns:** `Effect<Option<JsoncNode>>`

### `getNodePath(root, offset)`

Get the JSON path to the node at a given offset.

- **Returns:** `Effect<Option<JsoncPath>>`

### `getNodeValue(node)`

Reconstruct a JavaScript value from an AST node.

- **Returns:** `Effect<unknown>`

## Formatting and Modification

### `format(text, range?, options?)`

Compute formatting edits for a JSONC document.

- **Returns:** `Effect<JsoncEdit[]>`

### `applyEdits(text, edits)`

Apply an array of edits to source text (supports `Function.dual`).

- **Returns:** `Effect<string>`

### `formatAndApply(text, range?, options?)`

Format a JSONC document in one step.

- **Returns:** `Effect<string>`

### `modify(text, path, value, options?)`

Compute edits to insert, replace, or remove a value at a JSON path (supports
`Function.dual`).

- **Returns:** `Effect<JsoncEdit[], JsoncModificationError>`

## Equality

### `equals(self, that)`

Compare two JSONC strings for semantic equality. Parses both strings and
deep-compares the resulting values. Ignores comments, whitespace, formatting,
and object key ordering. Array order is significant.

Supports `Function.dual` (data-first and data-last).

- **Returns:** `Effect<boolean, JsoncParseError>`

### `equalsValue(self, value)`

Compare a JSONC string against a JavaScript value. Parses the JSONC string and
deep-compares against the provided value. Same comparison semantics as `equals`.

Supports `Function.dual` (data-first and data-last).

- **Returns:** `Effect<boolean, JsoncParseError>`

## Visitor / Stream

### `visit(text, options?)`

Stream of SAX-style visitor events.

- **Returns:** `Stream<JsoncVisitorEvent>`

Event types: `ObjectBegin`, `ObjectEnd`, `ObjectProperty`, `ArrayBegin`,
`ArrayEnd`, `LiteralValue`, `Separator`, `Comment`, `Error`.

### `visitCollect(text, predicate, options?)`

Collect filtered visitor events into an array.

- **Returns:** `Effect<A[]>`

## Types

| Type | Description |
| --- | --- |
| `JsoncNode` | AST node with type, offset, length, value, children |
| `JsoncEdit` | Text edit: offset, length, content |
| `JsoncRange` | Document range: offset, length |
| `JsoncToken` | Scanner token: kind, value, offset, length |
| `JsoncParseOptions` | disallowComments, allowTrailingComma, allowEmptyContent |
| `JsoncFormattingOptions` | tabSize, insertSpaces, eol, insertFinalNewline, keepLines |
| `JsoncVisitorEvent` | Discriminated union of 9 visitor event types |
| `JsoncSyntaxKind` | 17 token type literals |
| `JsoncNodeType` | 7 AST node type literals |

## Errors

| Error | Tag | Description |
| --- | --- | --- |
| `JsoncParseError` | `"JsoncParseError"` | Parse failure with array of error details |
| `JsoncNodeNotFoundError` | `"JsoncNodeNotFoundError"` | AST navigation failure |
| `JsoncModificationError` | `"JsoncModificationError"` | Modification failure |
| `JsoncError` | (union) | Union of all error types for exhaustive `catchTags` |
