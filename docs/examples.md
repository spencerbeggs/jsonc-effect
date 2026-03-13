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

## Equality comparisons

```typescript
import { equals, equalsValue } from "jsonc-effect"
import { Effect } from "effect"

// Two documents with different formatting, comments, and key order
const a = '{ "foo": 1, "bar": 2 }'
const b = '{ "bar": 2, /* comment */ "foo": 1 }'
Effect.runSync(equals(a, b)) // => true

// Array order matters
Effect.runSync(equals("[1, 2]", "[2, 1]")) // => false

// Compare against a known JS value
const doc = '{ "port": 3000, /* server */ "host": "localhost" }'
Effect.runSync(equalsValue(doc, { host: "localhost", port: 3000 })) // => true
```

## Using Effect.gen for multi-step workflows

```typescript
import { parseTree, findNode, getNodeValue } from "jsonc-effect"
import { Effect, Option } from "effect"

const program = Effect.gen(function* () {
  const root = yield* parseTree('{ "db": { "host": "localhost", "port": 5432 } }')
  if (Option.isNone(root)) return undefined

  const node = yield* findNode(root.value, ["db", "port"])
  if (Option.isNone(node)) return undefined

  return yield* getNodeValue(node.value)
})

Effect.runSync(program) // => 5432
```

## Batch processing with Effect.all and Effect.forEach

```typescript
import { parse, equals } from "jsonc-effect"
import { Effect } from "effect"

// Parse multiple documents as a tuple
const [config, schema] = Effect.runSync(
  Effect.all([
    parse('{ "host": "localhost" }'),
    parse('{ "type": "object" }'),
  ])
)

// Process an array of JSONC strings
const configs = Effect.runSync(
  Effect.forEach(
    ['{ "name": "app1" }', '{ "name": "app2" }'],
    (content) => parse(content),
  )
)
// => [{ name: "app1" }, { name: "app2" }]
```

## Schema integration with custom parse options

```typescript
import { makeJsoncFromString, makeJsoncSchema } from "jsonc-effect"
import { Schema } from "effect"

// Strict mode: no comments allowed
const StrictJsonc = makeJsoncFromString({
  disallowComments: true,
  allowTrailingComma: false,
})

// Compose with a domain schema
const AppConfig = Schema.Struct({
  name: Schema.String,
  port: Schema.Number,
  debug: Schema.optional(Schema.Boolean, { default: () => false }),
})

const AppConfigFromJsonc = makeJsoncSchema(AppConfig)

const config = Schema.decodeUnknownSync(AppConfigFromJsonc)(`{
  "name": "my-app",
  "port": 3000
  // debug defaults to false
}`)
// => { name: "my-app", port: 3000, debug: false }
```

## Async integration with Effect.runPromise

```typescript
import { parse, format, applyEdits } from "jsonc-effect"
import { Effect } from "effect"

async function formatConfig(content: string): Promise<string> {
  const edits = await Effect.runPromise(format(content))
  return Effect.runPromise(applyEdits(content, edits))
}

// Composing with other async code
const program = Effect.gen(function* () {
  const content = yield* Effect.tryPromise(
    () => fetch("/api/config").then((r) => r.text())
  )
  return yield* parse(content)
})
```

## Function.dual -- data-first and data-last styles

```typescript
import { equals, findNode, applyEdits, modify } from "jsonc-effect"
import { Effect, Option, pipe } from "effect"

// Data-first: all arguments at once
Effect.runSync(equals('{"a":1}', '{ "a": 1 }')) // => true

// Data-last: partial application in a pipeline
const matchesExpected = equals('{ "a": 1 }')
Effect.runSync(matchesExpected('{"a":1}')) // => true

// Pipeline with modify + applyEdits
const text = '{ "version": 1 }'
const updated = Effect.runSync(
  pipe(
    modify(["version"], 2)(text),
    Effect.flatMap((edits) => applyEdits(text, edits)),
  )
)
```

## Wrapping in an Effect Service

```typescript
import { Context, Effect, Layer } from "effect"
import { parse, format, applyEdits } from "jsonc-effect"
import type { JsoncParseError } from "jsonc-effect"

class ConfigParser extends Context.Tag("ConfigParser")<
  ConfigParser,
  {
    readonly load: (content: string) => Effect.Effect<unknown, JsoncParseError>
    readonly format: (content: string) => Effect.Effect<string>
  }
>() {}

const ConfigParserLive = Layer.succeed(ConfigParser, {
  load: (content) => parse(content),
  format: (content) =>
    format(content).pipe(
      Effect.flatMap((edits) => applyEdits(content, edits)),
    ),
})

const program = Effect.gen(function* () {
  const parser = yield* ConfigParser
  return yield* parser.load('{ "port": 3000 // server\n}')
})

Effect.runSync(program.pipe(Effect.provide(ConfigParserLive)))
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
