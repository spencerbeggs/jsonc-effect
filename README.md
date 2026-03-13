# jsonc-effect

Pure Effect-TS implementation of a JSONC (JSON with Comments) parser. No
external parser dependencies -- scanner, parser, AST, and formatting are all
implemented natively in Effect.

## Why

- **Effect-native** -- typed errors, Schema integration, composable pipelines
- **Zero parser dependencies** -- only runtime dependency is `effect`
- **Typed errors** -- `catchTag("JsoncParseError", ...)` instead of try/catch
- **Schema integration** -- parse JSONC strings directly into validated types
- **`unknown` not `any`** -- parse returns `unknown`, not `any`
- **`Option` for missing values** -- no `undefined` ambiguity

## Install

```bash
pnpm add jsonc-effect effect
```

```bash
npm install jsonc-effect effect
```

```bash
bun add jsonc-effect effect
```

## Quick Start

### Parse JSONC to a value

```typescript
import { parse } from "jsonc-effect"
import { Effect } from "effect"

const result = Effect.runSync(
  parse('{ "key": 42, /* comment */ }')
)
// => { key: 42 }
```

### Schema-validated parsing

```typescript
import { makeJsoncSchema } from "jsonc-effect"
import { Schema } from "effect"

const Config = Schema.Struct({
  port: Schema.Number,
  host: Schema.String,
})

const ConfigFromJsonc = makeJsoncSchema(Config)

// Parses JSONC string and validates against schema in one step
const config = Schema.decodeUnknownSync(ConfigFromJsonc)(
  '{ "port": 3000, "host": "localhost" }'
)
// config: { port: number, host: string }
```

### Error handling

```typescript
import { parse } from "jsonc-effect"
import { Effect } from "effect"

const program = parse("{ invalid }").pipe(
  Effect.catchTag("JsoncParseError", (error) => {
    console.error(error.message)
    // "JSONC parse failed with 1 error: ..."
    console.error(error.errors)
    // Array of { code, message, offset, length, startLine, startCharacter }
    return Effect.succeed({})
  })
)
```

## API

### Parser

- `parse(text, options?)` -- Parse JSONC to a JavaScript value.
  Returns `Effect<unknown, JsoncParseError>`.
- `parseTree(text, options?)` -- Parse JSONC to an AST.
  Returns `Effect<Option<JsoncNode>, JsoncParseError>`.
- `stripComments(text, replaceCh?)` -- Remove comments from JSONC text.
  Returns `Effect<string>`.

### Scanner

- `createScanner(text, ignoreTrivia?)` -- Create a low-level token scanner.
  Returns `JsoncScanner`.

### Schema Integration

- `JsoncFromString` -- `Schema<unknown, string>` that decodes a JSONC string
  to an unknown value.
- `makeJsoncFromString(options?)` -- Factory for `JsoncFromString` with custom
  parse options.
- `makeJsoncSchema(schema, options?)` -- Compose JSONC parsing with a target
  Schema for end-to-end typed parsing.

### AST Navigation

All navigation functions support `Function.dual` (data-first and data-last).

- `findNode(root, path)` -- Find node at a JSON path.
  Returns `Effect<Option<JsoncNode>>`.
- `findNodeAtOffset(root, offset)` -- Find innermost node at character offset.
  Returns `Effect<Option<JsoncNode>>`.
- `getNodePath(root, offset)` -- Get path to node at offset.
  Returns `Effect<Option<JsoncPath>>`.
- `getNodeValue(node)` -- Reconstruct value from AST node.
  Returns `Effect<unknown>`.

### Formatting and Modification

- `format(text, range?, options?)` -- Compute formatting edits.
  Returns `Effect<JsoncEdit[]>`.
- `applyEdits(text, edits)` -- Apply edits to text.
  Returns `Effect<string>`.
- `formatAndApply(text, range?, options?)` -- Format in one step.
  Returns `Effect<string>`.
- `modify(text, path, value, options?)` -- Compute modification edits.
  Returns `Effect<JsoncEdit[], JsoncModificationError>`.

### Visitor / Stream

- `visit(text, options?)` -- Stream of SAX-style visitor events.
  Returns `Stream<JsoncVisitorEvent>`.
- `visitCollect(text, predicate, options?)` -- Collect filtered visitor events.
  Returns `Effect<A[]>`.

### Types

- `JsoncNode` -- AST node with type, offset, length, value, children
- `JsoncEdit` -- Text edit: offset, length, content
- `JsoncRange` -- Document range: offset, length
- `JsoncToken` -- Scanner token: kind, value, offset, length
- `JsoncParseOptions` -- disallowComments, allowTrailingComma, allowEmptyContent
- `JsoncFormattingOptions` -- tabSize, insertSpaces, eol, insertFinalNewline,
  keepLines
- `JsoncVisitorEvent` -- Discriminated union of 9 visitor event types
- `JsoncSyntaxKind` -- 17 token type literals
- `JsoncNodeType` -- 7 AST node type literals

### Errors

- `JsoncParseError` (`"JsoncParseError"`) -- Parse failure with array of error
  details
- `JsoncNodeNotFoundError` (`"JsoncNodeNotFoundError"`) -- AST navigation
  failure
- `JsoncModificationError` (`"JsoncModificationError"`) -- Modification failure

## Examples

### Parsing tsconfig.json

```typescript
import { parse } from "jsonc-effect"
import { Effect } from "effect"

const tsconfig = `{
  // TypeScript configuration
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
  }
}`

const config = Effect.runSync(parse(tsconfig))
// => { compilerOptions: { strict: true, target: "ES2022" } }
```

### Modifying a JSONC document

```typescript
import { modify, applyEdits } from "jsonc-effect"
import { Effect } from "effect"

const input = '{ "version": 1, "name": "app" }'

const result = Effect.runSync(
  modify(input, ["version"], 2).pipe(
    Effect.flatMap((edits) => applyEdits(input, edits))
  )
)
// => '{ "version": 2, "name": "app" }'
```

### Streaming visitor events

```typescript
import { visit, type JsoncVisitorEvent } from "jsonc-effect"
import { Effect, Stream, Chunk } from "effect"

const events = Effect.runSync(
  visit('{ "a": 1, "b": [2, 3] }').pipe(
    Stream.filter(
      (e): e is Extract<JsoncVisitorEvent, { _tag: "LiteralValue" }> =>
        e._tag === "LiteralValue"
    ),
    Stream.runCollect,
    Effect.map(Chunk.toReadonlyArray)
  )
)
// => [{ _tag: "LiteralValue", value: 1, path: ["a"], ... }, ...]
```

### Formatting JSONC

```typescript
import { formatAndApply } from "jsonc-effect"
import { Effect } from "effect"

const ugly = '{"a":1,"b":2}'
const pretty = Effect.runSync(formatAndApply(ugly))
// => '{\n  "a": 1,\n  "b": 2\n}'
```

## Parse Options

- `disallowComments` (default: `false`) -- Report errors for comments
- `allowTrailingComma` (default: `true`) -- Allow trailing commas in objects
  and arrays
- `allowEmptyContent` (default: `false`) -- Allow empty input without error

Note: `allowTrailingComma` defaults to `true` (unlike Microsoft's jsonc-parser
which defaults to `false`) because JSONC config files commonly use trailing
commas.

## Comparison with jsonc-parser

- **Runtime:** Effect-TS vs plain JS
- **Error handling:** Typed `Effect.fail` vs mutable error arrays
- **Return type:** `unknown` vs `any`
- **Missing values:** `Option` vs `undefined`
- **Schema integration:** Built-in vs manual
- **Visitor API:** `Stream` vs callbacks
- **Dependencies:** `effect` only vs none

## License

MIT
