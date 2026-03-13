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
  - error-types.md
  - parser.md
  - schema-integration.md
  - ast-navigation.md
  - visitor.md
  - formatting.md
dependencies: []
---

# Effect Patterns Catalog

Catalog of Effect-TS patterns used throughout jsonc-effect, with rationale and usage examples.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [Related Documentation](#related-documentation)

---

## Overview

jsonc-effect uses several Effect-TS patterns consistently across all modules. This document
catalogs each pattern, explains why it was chosen, and shows how it is used.

**When to reference this document:**

- When adding new modules that need to follow established patterns
- When understanding the Effect-TS conventions used in this codebase
- When reviewing or modifying existing code

---

## Current State

### Pattern 1: Data.TaggedError with *Base Export

**Used in:** `errors.ts`

```typescript
export const JsoncParseErrorBase = Data.TaggedError("JsoncParseError");
export class JsoncParseError extends JsoncParseErrorBase<{
  readonly errors: ReadonlyArray<JsoncParseErrorDetail>;
  readonly text: string;
  readonly options?: Partial<JsoncParseOptions>;
}> {
  get message(): string { /* ... */ }
}
```

The `*Base` export is required for api-extractor compatibility. Without it, api-extractor cannot
properly resolve the class hierarchy for documentation generation.

### Pattern 2: Schema.Class for Data Types

**Used in:** `schemas.ts`

```typescript
export class JsoncToken extends Schema.Class<JsoncToken>("JsoncToken")({
  kind: JsoncSyntaxKind,
  value: Schema.String,
  offset: Schema.Number,
  // ...
}) {}
```

Provides structural equality (two tokens with the same fields are equal), validation, and composable
Schema pipelines. Used for `JsoncToken`, `JsoncNode`, `JsoncEdit`, `JsoncRange`, `JsoncParseOptions`,
and `JsoncFormattingOptions`.

### Pattern 3: Schema.Literal for Union Types

**Used in:** `schemas.ts`, `errors.ts`

```typescript
export const JsoncSyntaxKind = Schema.Literal(
  "OpenBrace", "CloseBrace", "OpenBracket", /* ... */
);
```

String literals instead of numeric enums for self-documenting debug output and natural JSON
serialization. Used for `JsoncSyntaxKind` (17 token types), `JsoncScanError` (8 error codes),
`JsoncNodeType` (7 node types), and `JsoncParseErrorCode` (16 parse error codes).

### Pattern 4: Effect.sync for Synchronous Wrapping

**Used in:** `parse.ts`, `ast.ts`, `format.ts`

```typescript
export const parse = (text, options?) =>
  Effect.sync(() => parseInternal(text, options ?? {}, false)).pipe(
    Effect.flatMap(({ value, errors }) => {
      if (errors.length > 0) return Effect.fail(new JsoncParseError({ errors, text, options }));
      return Effect.succeed(value);
    }),
  );
```

Wraps synchronous parsing in Effect for composition with Effect pipelines, typed error channels,
and consistent API surface. All public API functions use this pattern.

### Pattern 5: Function.dual for Dual API

**Used in:** `ast.ts` (`findNode`, `findNodeAtOffset`, `getNodePath`), `format.ts` (`applyEdits`,
`modify`)

```typescript
export const findNode: {
  (path: JsoncPath): (root: JsoncNode) => Effect.Effect<Option.Option<JsoncNode>>;
  (root: JsoncNode, path: JsoncPath): Effect.Effect<Option.Option<JsoncNode>>;
} = Fn.dual(2, (root: JsoncNode, path: JsoncPath) =>
  Effect.sync(() => findNodeImpl(root, path))
);
```

`Function.dual` enables both data-first (`findNode(root, path)`) and data-last
(`pipe(root, findNode(path))`) calling conventions. The arity argument (2) tells Effect how many
arguments the data-first form expects.

### Pattern 6: Schema.transformOrFail for Parsing Pipelines

**Used in:** `schema-integration.ts`

```typescript
export function makeJsoncFromString(options?): Schema.Schema<unknown, string> {
  return Schema.transformOrFail(Schema.String, Schema.Unknown, {
    strict: true,
    decode: (input, _options, ast) => {
      const program = parse(input);
      return Effect.mapError(program, (parseError) =>
        new ParseResult.Type(ast, input, parseError.message)
      );
    },
    encode: (value) => ParseResult.succeed(JSON.stringify(value, null, 2)),
  });
}
```

`Schema.transformOrFail` creates a schema transformation that can fail during decoding. Combined
with `Schema.compose`, this enables end-to-end pipelines: JSONC string to unknown to typed domain
object.

### Pattern 7: Stream.fromIterable for Visitor Events

**Used in:** `visitor.ts`

```typescript
export const visit = (text: string, options?): Stream.Stream<JsoncVisitorEvent> => {
  const events: JsoncVisitorEvent[] = [];
  visitImpl(text, events, options);
  return Stream.fromIterable(events);
};
```

`Stream.fromIterable` wraps the collected visitor events into an Effect `Stream`, enabling
downstream consumers to use `Stream.filter`, `Stream.map`, `Stream.runCollect`, and other
stream combinators.

### Pattern 8: Option.Option for Empty Content

**Used in:** `parse.ts` (`parseTree`), `ast.ts` (navigation functions)

```typescript
export const parseTree = (text, options?) =>
  // ...
  Effect.succeed(root ? Option.some(root) : Option.none());
```

`parseTree` returns `Option.Option<JsoncNode>` to distinguish between empty content (Option.none)
and a valid parse result (Option.some). Navigation functions also return `Option` for "not found".

---

## Rationale

### Pure Functions Over Services

Parsing is synchronous and stateless. Using Effect services (Layers, Context) would add complexity
without benefit. All public APIs are pure functions that take input and return `Effect` values.

### Schema-Driven Data Types

Using `Schema.Class` for tokens, nodes, and options provides:

1. **Structural equality** -- Built-in for testing (`Equal.equals`)
2. **Validation** -- Schema can validate constructed values
3. **Self-documenting** -- Schema definitions serve as documentation
4. **Composability** -- Enables `Schema.transformOrFail` pipelines

### String Literals Over Numeric Enums

`Schema.Literal` with string values was chosen over TypeScript numeric enums because:

1. Self-documenting in debug output (shows `"OpenBrace"` not `1`)
2. Natural JSON serialization without reverse mapping
3. Readable test assertions
4. Idiomatic Effect-TS

---

## Related Documentation

- [Architecture](architecture.md) -- Where these patterns fit in the system
- [Error Types](error-types.md) -- Data.TaggedError usage
- [Parser](parser.md) -- Effect.sync wrapping
- [Schema Integration](schema-integration.md) -- Schema.transformOrFail pipelines
- [AST Navigation](ast-navigation.md) -- Function.dual usage
- [Visitor](visitor.md) -- Stream.fromIterable usage
- [Formatting](formatting.md) -- Function.dual usage
