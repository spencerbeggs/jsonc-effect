# Examples

## Parsing tsconfig.json

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

## Pipeline composition

```typescript
import { parse, modify, applyEdits } from "jsonc-effect"
import { Effect, pipe } from "effect"

const input = '{ "version": 1 }'

const updated = pipe(
  input,
  modify(["version"], 2),
  Effect.flatMap((edits) => applyEdits(input, edits)),
  Effect.runSync,
)
// => '{ "version": 2 }'
```

## Modifying a JSONC document

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

## Streaming visitor events

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

## Formatting JSONC

```typescript
import { formatAndApply } from "jsonc-effect"
import { Effect } from "effect"

const ugly = '{"a":1,"b":2}'
const pretty = Effect.runSync(formatAndApply(ugly))
// => '{\n  "a": 1,\n  "b": 2\n}'
```

## Exhaustive error handling

```typescript
import { parse } from "jsonc-effect"
import { Effect } from "effect"

const program = parse("{ invalid }").pipe(
  Effect.catchTags({
    JsoncParseError: (e) => {
      console.error(`Parse failed: ${e.message}`)
      return Effect.succeed({})
    },
  })
)
```

## Comparison with jsonc-parser

| Aspect | jsonc-effect | jsonc-parser |
| --- | --- | --- |
| Runtime | Effect-TS | Plain JS |
| Error handling | Typed `Effect.fail` | Mutable error arrays |
| Return type | `unknown` | `any` |
| Missing values | `Option` | `undefined` |
| Schema integration | Built-in | Manual |
| Visitor API | `Stream` | Callbacks |
| Dependencies | `effect` only | None |
