/**
 * JSONC Scanner (Lexer) — converts a JSONC string into a stream of tokens.
 *
 * Pure implementation, no external parser dependencies.
 * Reference: Microsoft's jsonc-parser scanner design (MIT).
 *
 * @packageDocumentation
 */

import type { JsoncScanError, JsoncSyntaxKind } from "./schemas.js";

/**
 * JSONC Scanner interface — a stateful cursor over input text.
 */
export interface JsoncScanner {
	/** Advance to the next token and return its kind */
	scan(): JsoncSyntaxKind;
	/** Get the current token kind */
	getToken(): JsoncSyntaxKind;
	/** Get the string value of the current token */
	getTokenValue(): string;
	/** Get the character offset of the current token */
	getTokenOffset(): number;
	/** Get the length of the current token */
	getTokenLength(): number;
	/** Get the line number of the current token start */
	getTokenStartLine(): number;
	/** Get the character position within the line */
	getTokenStartCharacter(): number;
	/** Get the scan error for the current token */
	getTokenError(): JsoncScanError;
	/** Get the current scanner position */
	getPosition(): number;
	/** Set the scanner position */
	setPosition(pos: number): void;
}

const isWhitespace = (ch: number): boolean =>
	ch === 0x20 || ch === 0x09 || ch === 0x0b || ch === 0x0c || ch === 0xa0 || ch === 0xfeff;

const isLineBreak = (ch: number): boolean => ch === 0x0a || ch === 0x0d || ch === 0x2028 || ch === 0x2029;

const isDigit = (ch: number): boolean => ch >= 0x30 && ch <= 0x39;

/**
 * Create a JSONC scanner.
 *
 * @param text - The JSONC string to scan
 * @param ignoreTrivia - If true, skip whitespace, line breaks, and comments
 * @returns A JsoncScanner for iterating over tokens
 */
export const createScanner = (text: string, ignoreTrivia = false): JsoncScanner => {
	const len = text.length;
	let pos = 0;
	let tokenOffset = 0;
	let token: JsoncSyntaxKind = "Unknown";
	let tokenValue = "";
	let tokenError: JsoncScanError = "None";
	let lineNumber = 0;
	let lineStartOffset = 0;
	let tokenStartLine = 0;
	let tokenStartCharacter = 0;

	const scanHexDigits = (count: number): number => {
		let value = 0;
		for (let i = 0; i < count; i++) {
			if (pos >= len) return -1;
			const ch = text.charCodeAt(pos);
			if (ch >= 0x30 && ch <= 0x39) {
				value = value * 16 + (ch - 0x30);
			} else if (ch >= 0x41 && ch <= 0x46) {
				value = value * 16 + (ch - 0x41 + 10);
			} else if (ch >= 0x61 && ch <= 0x66) {
				value = value * 16 + (ch - 0x61 + 10);
			} else {
				return -1;
			}
			pos++;
		}
		return value;
	};

	const scanString = (): string => {
		let result = "";
		pos++; // skip opening quote
		let start = pos;
		while (pos < len) {
			const ch = text.charCodeAt(pos);
			if (ch === 0x22) {
				// closing quote
				result += text.substring(start, pos);
				pos++;
				return result;
			}
			if (ch === 0x5c) {
				// backslash
				result += text.substring(start, pos);
				pos++;
				if (pos >= len) {
					tokenError = "UnexpectedEndOfString";
					return result;
				}
				const escaped = text.charCodeAt(pos);
				pos++;
				switch (escaped) {
					case 0x22: // "
						result += '"';
						break;
					case 0x5c: // \
						result += "\\";
						break;
					case 0x2f: // /
						result += "/";
						break;
					case 0x62: // b
						result += "\b";
						break;
					case 0x66: // f
						result += "\f";
						break;
					case 0x6e: // n
						result += "\n";
						break;
					case 0x72: // r
						result += "\r";
						break;
					case 0x74: // t
						result += "\t";
						break;
					case 0x75: {
						// u
						const value = scanHexDigits(4);
						if (value >= 0) {
							result += String.fromCharCode(value);
						} else {
							tokenError = "InvalidUnicode";
						}
						break;
					}
					default:
						tokenError = "InvalidEscapeCharacter";
						break;
				}
				start = pos;
			} else if (isLineBreak(ch)) {
				tokenError = "UnexpectedEndOfString";
				return result + text.substring(start, pos);
			} else {
				pos++;
			}
		}
		tokenError = "UnexpectedEndOfString";
		return result + text.substring(start, pos);
	};

	const scanNumber = (): string => {
		const start = pos;
		if (text.charCodeAt(pos) === 0x2d) {
			// minus
			pos++;
		}
		// Integer part
		if (text.charCodeAt(pos) === 0x30) {
			pos++;
		} else {
			if (!isDigit(text.charCodeAt(pos))) {
				tokenError = "UnexpectedEndOfNumber";
				return text.substring(start, pos);
			}
			pos++;
			while (pos < len && isDigit(text.charCodeAt(pos))) {
				pos++;
			}
		}
		// Fractional part
		if (pos < len && text.charCodeAt(pos) === 0x2e) {
			pos++;
			if (!isDigit(text.charCodeAt(pos))) {
				tokenError = "UnexpectedEndOfNumber";
				return text.substring(start, pos);
			}
			pos++;
			while (pos < len && isDigit(text.charCodeAt(pos))) {
				pos++;
			}
		}
		// Exponent part
		if (pos < len && (text.charCodeAt(pos) === 0x45 || text.charCodeAt(pos) === 0x65)) {
			pos++;
			if (pos < len && (text.charCodeAt(pos) === 0x2b || text.charCodeAt(pos) === 0x2d)) {
				pos++;
			}
			if (!isDigit(text.charCodeAt(pos))) {
				tokenError = "UnexpectedEndOfNumber";
				return text.substring(start, pos);
			}
			pos++;
			while (pos < len && isDigit(text.charCodeAt(pos))) {
				pos++;
			}
		}
		return text.substring(start, pos);
	};

	const scan = (): JsoncSyntaxKind => {
		tokenValue = "";
		tokenError = "None";

		if (pos >= len) {
			tokenOffset = len;
			tokenStartLine = lineNumber;
			tokenStartCharacter = pos - lineStartOffset;
			token = "EOF";
			return token;
		}

		let ch = text.charCodeAt(pos);

		// Whitespace
		if (isWhitespace(ch)) {
			tokenOffset = pos;
			tokenStartLine = lineNumber;
			tokenStartCharacter = pos - lineStartOffset;
			do {
				pos++;
				ch = pos < len ? text.charCodeAt(pos) : 0;
			} while (isWhitespace(ch));
			tokenValue = text.substring(tokenOffset, pos);
			if (ignoreTrivia) return scan();
			token = "Trivia";
			return token;
		}

		// Line breaks
		if (isLineBreak(ch)) {
			tokenOffset = pos;
			tokenStartLine = lineNumber;
			tokenStartCharacter = pos - lineStartOffset;
			pos++;
			if (ch === 0x0d && pos < len && text.charCodeAt(pos) === 0x0a) {
				pos++; // \r\n
			}
			lineNumber++;
			lineStartOffset = pos;
			tokenValue = text.substring(tokenOffset, pos);
			if (ignoreTrivia) return scan();
			token = "LineBreak";
			return token;
		}

		tokenOffset = pos;
		tokenStartLine = lineNumber;
		tokenStartCharacter = pos - lineStartOffset;

		switch (ch) {
			case 0x7b: // {
				pos++;
				tokenValue = "{";
				token = "OpenBrace";
				return token;
			case 0x7d: // }
				pos++;
				tokenValue = "}";
				token = "CloseBrace";
				return token;
			case 0x5b: // [
				pos++;
				tokenValue = "[";
				token = "OpenBracket";
				return token;
			case 0x5d: // ]
				pos++;
				tokenValue = "]";
				token = "CloseBracket";
				return token;
			case 0x3a: // :
				pos++;
				tokenValue = ":";
				token = "Colon";
				return token;
			case 0x2c: // ,
				pos++;
				tokenValue = ",";
				token = "Comma";
				return token;
			case 0x22: // "
				tokenValue = scanString();
				token = "String";
				return token;
			case 0x2f: {
				// /
				const nextCh = pos + 1 < len ? text.charCodeAt(pos + 1) : 0;
				if (nextCh === 0x2f) {
					// line comment
					pos += 2;
					while (pos < len && !isLineBreak(text.charCodeAt(pos))) {
						pos++;
					}
					tokenValue = text.substring(tokenOffset, pos);
					if (ignoreTrivia) return scan();
					token = "LineComment";
					return token;
				}
				if (nextCh === 0x2a) {
					// block comment
					pos += 2;
					const safeLen = len - 1;
					let commentClosed = false;
					while (pos < safeLen) {
						const cch = text.charCodeAt(pos);
						if (isLineBreak(cch)) {
							if (cch === 0x0d && pos + 1 < len && text.charCodeAt(pos + 1) === 0x0a) {
								pos++;
							}
							pos++;
							lineNumber++;
							lineStartOffset = pos;
						} else if (cch === 0x2a && text.charCodeAt(pos + 1) === 0x2f) {
							pos += 2;
							commentClosed = true;
							break;
						} else {
							pos++;
						}
					}
					if (!commentClosed) {
						pos = len;
						tokenError = "UnexpectedEndOfComment";
					}
					tokenValue = text.substring(tokenOffset, pos);
					if (ignoreTrivia) return scan();
					token = "BlockComment";
					return token;
				}
				// single slash is unknown
				pos++;
				tokenValue = text.substring(tokenOffset, pos);
				token = "Unknown";
				tokenError = "InvalidCharacter";
				return token;
			}
			case 0x2d: // -
				if (pos + 1 < len && isDigit(text.charCodeAt(pos + 1))) {
					tokenValue = scanNumber();
					token = "Number";
					return token;
				}
				pos++;
				tokenValue = "-";
				token = "Unknown";
				tokenError = "InvalidSymbol" as JsoncScanError;
				return token;
			default:
				// numbers
				if (isDigit(ch)) {
					tokenValue = scanNumber();
					token = "Number";
					return token;
				}
				// keywords and unknown
				if (ch >= 0x61 && ch <= 0x7a) {
					// a-z
					const start = pos;
					pos++;
					while (pos < len) {
						const kch = text.charCodeAt(pos);
						if (kch >= 0x61 && kch <= 0x7a) {
							pos++;
						} else {
							break;
						}
					}
					tokenValue = text.substring(start, pos);
					switch (tokenValue) {
						case "true":
							token = "True";
							return token;
						case "false":
							token = "False";
							return token;
						case "null":
							token = "Null";
							return token;
						default:
							token = "Unknown";
							tokenError = "InvalidSymbol" as JsoncScanError;
							return token;
					}
				}
				pos++;
				tokenValue = text.substring(tokenOffset, pos);
				token = "Unknown";
				tokenError = "InvalidCharacter";
				return token;
		}
	};

	return {
		scan,
		getToken: () => token,
		getTokenValue: () => tokenValue,
		getTokenOffset: () => tokenOffset,
		getTokenLength: () => pos - tokenOffset,
		getTokenStartLine: () => tokenStartLine,
		getTokenStartCharacter: () => tokenStartCharacter,
		getTokenError: () => tokenError,
		getPosition: () => pos,
		setPosition: (newPos: number) => {
			pos = newPos;
			tokenValue = "";
			token = "Unknown";
			tokenError = "None";
		},
	};
};
