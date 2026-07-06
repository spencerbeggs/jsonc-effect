---
"jsonc-effect": patch
---

## Bug Fixes

- Fixed `parseTree` node spans running past trailing whitespace/comments to the next scanned token; offsets/lengths now end at the node's last token, so `findNodeAtOffset` and `getNodePath` resolve offsets in trailing trivia to the containing node instead of the preceding value (#62)
- Fixed `modify` producing non-minimal edits: replacing a value no longer deletes the whitespace/newline between the value and a following `}`/`]`, and inserting a new property now appends `,\n<indent>"key": ...` directly after the last value instead of emitting the comma on its own line and dropping the newline before the closing brace
