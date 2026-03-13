/**
 * jsonc-effect
 *
 * Pure Effect-TS implementation of a JSONC (JSON with Comments) parser.
 * No external parser dependencies — scanner, parser, AST, and formatting
 * are all implemented natively in Effect.
 *
 * @packageDocumentation
 */

// AST Navigation
export { findNode, findNodeAtOffset, getNodePath, getNodeValue } from "./ast.js";
export type { JsoncError, JsoncParseErrorCode } from "./errors.js";
// Errors
export {
	JsoncModificationError,
	JsoncModificationErrorBase,
	JsoncNodeNotFoundError,
	JsoncNodeNotFoundErrorBase,
	JsoncParseError,
	JsoncParseErrorBase,
	JsoncParseErrorDetail,
} from "./errors.js";
// Formatting and Modification
export { applyEdits, format, formatAndApply, modify } from "./format.js";
// Parser
export { parse, parseTree, stripComments } from "./parse.js";
export type { JsoncScanner } from "./scanner.js";
// Scanner
export { createScanner } from "./scanner.js";

// Schema Integration
export { JsoncFromString, makeJsoncFromString, makeJsoncSchema } from "./schema-integration.js";
export type {
	JsoncNodeType,
	JsoncPath,
	JsoncScanError,
	JsoncSegment,
	JsoncSyntaxKind,
} from "./schemas.js";
// Schemas
export {
	JsoncEdit,
	JsoncFormattingOptions,
	JsoncNode,
	JsoncParseOptions,
	JsoncRange,
	JsoncToken,
} from "./schemas.js";
export type { JsoncVisitorEvent } from "./visitor.js";
// Visitor/Stream
export { visit, visitCollect } from "./visitor.js";
