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
 * Find a node at a specific path in the AST.
 *
 * Traverses the AST following property names (strings) and
 * array indices (numbers) in the path.
 */
export const findNode: {
	(path: JsoncPath): (root: JsoncNode) => Effect.Effect<Option.Option<JsoncNode>>;
	(root: JsoncNode, path: JsoncPath): Effect.Effect<Option.Option<JsoncNode>>;
} = Fn.dual(2, (root: JsoncNode, path: JsoncPath) => Effect.sync(() => findNodeImpl(root, path)));

/**
 * Find the innermost node covering a character offset.
 */
export const findNodeAtOffset: {
	(offset: number): (root: JsoncNode) => Effect.Effect<Option.Option<JsoncNode>>;
	(root: JsoncNode, offset: number): Effect.Effect<Option.Option<JsoncNode>>;
} = Fn.dual(2, (root: JsoncNode, offset: number) => Effect.sync(() => findNodeAtOffsetImpl(root, offset)));

/**
 * Get the JSON path to the node at a specific offset.
 */
export const getNodePath: {
	(targetOffset: number): (root: JsoncNode) => Effect.Effect<Option.Option<JsoncPath>>;
	(root: JsoncNode, targetOffset: number): Effect.Effect<Option.Option<JsoncPath>>;
} = Fn.dual(2, (root: JsoncNode, targetOffset: number) => Effect.sync(() => buildPath(root, targetOffset, [])));

/**
 * Evaluate a node subtree into a plain JavaScript value.
 * Reconstructs objects and arrays from the AST.
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
