/**
 * AST navigation functions for JSONC parse trees.
 *
 * Operates on JsoncNode trees produced by parseTree().
 *
 * @packageDocumentation
 */

import { Effect, Function as Fn, Option } from "effect";
import type { JsoncNode, JsoncPath } from "./schemas.js";

/**
 * Find an AST node at a specific JSON path.
 *
 * Supports {@link https://effect.website/docs/effect/function#dual | Function.dual}
 * for both data-first and data-last (pipeline) usage.
 *
 * @param root - The AST root node obtained from {@link parseTree}.
 * @param path - An array of string keys and numeric indices describing the path to traverse.
 *
 * @returns `Effect<Option<JsoncNode>>` — the node at the given path, or `Option.none()` if the
 *   path does not exist in the tree.
 *
 * @remarks
 * String segments navigate object properties and number segments navigate array indices.
 * Returns `Option.none()` when any segment along the path cannot be resolved — for example,
 * accessing a property on a non-object node or an out-of-bounds array index.
 *
 * @see {@link parseTree} — produces the AST root this function operates on
 * @see {@link getNodeValue} — reconstructs a JS value from a found node
 * @see {@link JsoncNode} — the AST node type
 * @see {@link JsoncPath} — the path segment array type
 *
 * @example Data-first usage
 * ```ts
 * import { Effect, Option } from "effect";
 * import type { JsoncNode } from "jsonc-effect";
 * import { parseTree, findNode } from "jsonc-effect";
 *
 * const program = Effect.gen(function* () {
 *   const root: Option.Option<JsoncNode> = yield* parseTree('{ "a": { "b": 1 } }');
 *   if (Option.isNone(root)) return Option.none();
 *   return yield* findNode(root.value, ["a", "b"]);
 * });
 *
 * const result = Effect.runSync(program);
 * // result is Option.some(node) where node.value === 1
 * ```
 *
 * @example Data-last pipeline usage
 * ```ts
 * import { Effect, Option, pipe } from "effect";
 * import type { JsoncNode } from "jsonc-effect";
 * import { parseTree, findNode } from "jsonc-effect";
 *
 * const program = Effect.gen(function* () {
 *   const root: Option.Option<JsoncNode> = yield* parseTree('{ "x": [10, 20] }');
 *   if (Option.isNone(root)) return Option.none();
 *   return yield* pipe(root.value, findNode(["x", 1]));
 * });
 *
 * const result = Effect.runSync(program);
 * // result is Option.some(node) where node.value === 20
 * ```
 *
 * @privateRemarks
 * Wrapped in `Effect.sync`; the underlying traversal is fully synchronous.
 *
 * @public
 */
export const findNode: {
	(path: JsoncPath): (root: JsoncNode) => Effect.Effect<Option.Option<JsoncNode>>;
	(root: JsoncNode, path: JsoncPath): Effect.Effect<Option.Option<JsoncNode>>;
} = Fn.dual(2, (root: JsoncNode, path: JsoncPath) => Effect.sync(() => findNodeImpl(root, path)));

/**
 * Find the innermost AST node covering a character offset.
 *
 * Supports {@link https://effect.website/docs/effect/function#dual | Function.dual}
 * for both data-first and data-last (pipeline) usage.
 *
 * @param root - The AST root node obtained from {@link parseTree}.
 * @param offset - A zero-based character offset into the original JSONC string.
 *
 * @returns `Effect<Option<JsoncNode>>` — the most deeply nested node whose span
 *   includes the offset, or `Option.none()` if the offset is outside the tree.
 *
 * @remarks
 * This is useful for editor integrations such as hover information, go-to-definition,
 * and code completions where you need to identify the token under the cursor.
 *
 * @see {@link parseTree} — produces the AST root this function operates on
 * @see {@link getNodePath} — returns the JSON path to the node at an offset
 *
 * @example Finding a node at an offset
 * ```ts
 * import { Effect, Option } from "effect";
 * import type { JsoncNode } from "jsonc-effect";
 * import { parseTree, findNodeAtOffset } from "jsonc-effect";
 *
 * const program = Effect.gen(function* () {
 *   const root: Option.Option<JsoncNode> = yield* parseTree('{ "key": "value" }');
 *   if (Option.isNone(root)) return Option.none();
 *   // Offset 10 is inside the "value" string literal
 *   return yield* findNodeAtOffset(root.value, 10);
 * });
 *
 * const result = Effect.runSync(program);
 * // result is Option.some(node) where node.type === "string"
 * ```
 *
 * @privateRemarks
 * Wrapped in `Effect.sync`; the underlying traversal is fully synchronous.
 *
 * @public
 */
export const findNodeAtOffset: {
	(offset: number): (root: JsoncNode) => Effect.Effect<Option.Option<JsoncNode>>;
	(root: JsoncNode, offset: number): Effect.Effect<Option.Option<JsoncNode>>;
} = Fn.dual(2, (root: JsoncNode, offset: number) => Effect.sync(() => findNodeAtOffsetImpl(root, offset)));

/**
 * Get the JSON path to the node at a specific character offset.
 *
 * Supports {@link https://effect.website/docs/effect/function#dual | Function.dual}
 * for both data-first and data-last (pipeline) usage.
 *
 * @param root - The AST root node obtained from {@link parseTree}.
 * @param targetOffset - A zero-based character offset into the original JSONC string.
 *
 * @returns `Effect<Option<JsoncPath>>` — an array of path segments (string keys
 *   and numeric indices) leading to the innermost node at the offset, or
 *   `Option.none()` if the offset is outside the tree.
 *
 * @remarks
 * Returns the path segments leading to the innermost node that spans the given
 * offset. This is the inverse of {@link findNode} — given an offset you get the path,
 * and given a path you get the node.
 *
 * @see {@link findNodeAtOffset} — returns the node itself rather than its path
 * @see {@link JsoncPath} — the path segment array type
 *
 * @example Getting the path at an offset
 * ```ts
 * import { Effect, Option } from "effect";
 * import type { JsoncNode, JsoncPath } from "jsonc-effect";
 * import { parseTree, getNodePath } from "jsonc-effect";
 *
 * const program = Effect.gen(function* () {
 *   const root: Option.Option<JsoncNode> = yield* parseTree('{ "a": { "b": 42 } }');
 *   if (Option.isNone(root)) return Option.none();
 *   // Offset 15 points inside the value 42
 *   return yield* getNodePath(root.value, 15);
 * });
 *
 * const result: Option.Option<JsoncPath> = Effect.runSync(program);
 * // result is Option.some(["a", "b"])
 * ```
 *
 * @public
 */
export const getNodePath: {
	(targetOffset: number): (root: JsoncNode) => Effect.Effect<Option.Option<JsoncPath>>;
	(root: JsoncNode, targetOffset: number): Effect.Effect<Option.Option<JsoncPath>>;
} = Fn.dual(2, (root: JsoncNode, targetOffset: number) => Effect.sync(() => buildPath(root, targetOffset, [])));

/**
 * Reconstruct a plain JavaScript value from an AST subtree.
 *
 * @param node - The AST node to evaluate, typically obtained via {@link findNode} or
 *   as the root from {@link parseTree}.
 *
 * @returns `Effect<unknown>` — the reconstructed JS value (object, array, string,
 *   number, boolean, or null).
 *
 * @remarks
 * Recursively evaluates the node tree to produce a plain JavaScript value.
 * This is the inverse of {@link parseTree}: where `parseTree` turns a JSONC string
 * into an AST, `getNodeValue` turns an AST subtree back into a JS value.
 *
 * @see {@link parseTree} — produces the AST that this function evaluates
 * @see {@link findNode} — locates a subtree to pass to this function
 *
 * @example Extracting the value of a found node
 * ```ts
 * import { Effect, Option } from "effect";
 * import type { JsoncNode } from "jsonc-effect";
 * import { parseTree, findNode, getNodeValue } from "jsonc-effect";
 *
 * const program = Effect.gen(function* () {
 *   const root: Option.Option<JsoncNode> = yield* parseTree('{ "items": [1, 2, 3] }');
 *   if (Option.isNone(root)) return undefined;
 *   const node: Option.Option<JsoncNode> = yield* findNode(root.value, ["items"]);
 *   if (Option.isNone(node)) return undefined;
 *   return yield* getNodeValue(node.value);
 * });
 *
 * const result = Effect.runSync(program);
 * // result is [1, 2, 3]
 * ```
 *
 * @privateRemarks
 * Useful after {@link findNode} to extract a subtree's value without manual
 * AST traversal.
 *
 * @public
 */
export const getNodeValue = (node: JsoncNode): Effect.Effect<unknown> => Effect.sync(() => evaluateNode(node));

// ============================================================
// Implementation
// ============================================================

function findNodeImpl(root: JsoncNode, path: ReadonlyArray<string | number>): Option.Option<JsoncNode> {
	let current: JsoncNode | undefined = root;

	for (const segment of path) {
		if (!current?.children) {
			return Option.none();
		}

		if (typeof segment === "string") {
			if (current.type !== "object") return Option.none();
			const property: JsoncNode | undefined = current.children.find(
				(child) => child.type === "property" && child.children !== undefined && child.children[0]?.value === segment,
			);
			current = property?.children?.[1];
		} else {
			if (current.type !== "array") return Option.none();
			current = current.children[segment];
		}
	}

	return current ? Option.some(current) : Option.none();
}

function findNodeAtOffsetImpl(root: JsoncNode, offset: number): Option.Option<JsoncNode> {
	if (offset < root.offset || offset >= root.offset + root.length) {
		return Option.none();
	}

	if (!root.children) {
		return Option.some(root);
	}

	// Search children for the most specific node
	for (const child of root.children) {
		if (offset >= child.offset && offset < child.offset + child.length) {
			return findNodeAtOffsetImpl(child, offset);
		}
	}

	return Option.some(root);
}

function buildPath(
	node: JsoncNode,
	targetOffset: number,
	currentPath: Array<string | number>,
): Option.Option<JsoncPath> {
	if (targetOffset < node.offset || targetOffset >= node.offset + node.length) {
		return Option.none();
	}

	if (!node.children) {
		return Option.some(currentPath);
	}

	if (node.type === "object") {
		for (const prop of node.children) {
			if (
				prop.type === "property" &&
				prop.children !== undefined &&
				targetOffset >= prop.offset &&
				targetOffset < prop.offset + prop.length
			) {
				const key = prop.children[0]?.value as string;
				const valuePath = [...currentPath, key];
				const valueChild = prop.children[1];
				if (valueChild && targetOffset >= valueChild.offset && targetOffset < valueChild.offset + valueChild.length) {
					return buildPath(valueChild, targetOffset, valuePath);
				}
				return Option.some(valuePath);
			}
		}
	} else if (node.type === "array") {
		for (let i = 0; i < node.children.length; i++) {
			const child = node.children[i];
			if (targetOffset >= child.offset && targetOffset < child.offset + child.length) {
				return buildPath(child, targetOffset, [...currentPath, i]);
			}
		}
	}

	return Option.some(currentPath);
}

function evaluateNode(node: JsoncNode): unknown {
	switch (node.type) {
		case "object": {
			const obj: Record<string, unknown> = {};
			if (node.children) {
				for (const prop of node.children) {
					if (prop.type === "property" && prop.children !== undefined && prop.children.length === 2) {
						const key = prop.children[0].value as string;
						obj[key] = evaluateNode(prop.children[1]);
					}
				}
			}
			return obj;
		}
		case "array":
			return (node.children ?? []).map(evaluateNode);
		case "property":
			return node.children?.[1] ? evaluateNode(node.children[1]) : undefined;
		case "string":
		case "number":
		case "boolean":
		case "null":
			return node.value;
	}
}
