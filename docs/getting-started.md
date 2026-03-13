# Getting Started

## Installation

```bash
npm install jsonc-effect effect
```

Both `jsonc-effect` and `effect` are required. The `effect` package is the sole runtime dependency.

## Parse a JSONC string

```typescript
import { parse } from "jsonc-effect"
import { Effect } from "effect"

const result = Effect.runSync(
  parse('{ "key": 42, /* comment */ }')
)
// => { key: 42 }
```

`parse` returns `Effect<unknown, JsoncParseError>`. Comments and trailing commas are allowed by default.

## Schema-validated parsing

Parse a JSONC string and validate it against an Effect Schema in one step:

```typescript
import { makeJsoncSchema } from "jsonc-effect"
import { Schema } from "effect"

const Config = Schema.Struct({
  port: Schema.Number,
  host: Schema.String,
})

const ConfigFromJsonc = makeJsoncSchema(Config)

const config = Schema.decodeUnknownSync(ConfigFromJsonc)(
  '{ "port": 3000, "host": "localhost" }'
)
// config: { port: number, host: string }
```

## Error handling

All errors are typed and use Effect's error channel:

```typescript
import { parse } from "jsonc-effect"
import { Effect } from "effect"

const program = parse("{ invalid }").pipe(
  Effect.catchTag("JsoncParseError", (error) => {
    console.error(error.message)
    console.error(error.errors)
    // Array of { code, message, offset, length, startLine, startCharacter }
    return Effect.succeed({})
  })
)
```

## Using Effect.gen

```typescript
import { parse, parseTree, findNode, getNodeValue } from "jsonc-effect"
import { Effect, Option } from "effect"

const program = Effect.gen(function* () {
  const root = yield* parseTree('{ "users": [{ "name": "Alice" }] }')
  if (Option.isNone(root)) return undefined

  const node = yield* findNode(root.value, ["users", 0, "name"])
  if (Option.isNone(node)) return undefined

  return yield* getNodeValue(node.value)
})

const result = Effect.runSync(program)
// => "Alice"
```

## Parse options

| Option | Default | Description |
| --- | --- | --- |
| `disallowComments` | `false` | Report errors for comments |
| `allowTrailingComma` | `true` | Allow trailing commas |
| `allowEmptyContent` | `false` | Allow empty input without error |

`allowTrailingComma` defaults to `true` (unlike Microsoft's jsonc-parser) because JSONC config files commonly use trailing commas.

## Next steps

- [API Reference](./api.md) -- all exports with signatures
- [Examples](./examples.md) -- real-world usage patterns
