export const OWNER_N1_MAX_FRAME_BYTES = 65_536;

const OWNER_N1_MAX_FRAMES = 2;
const RECORD_SEPARATOR = 0x1e;
const LINE_FEED = 0x0a;
const DOUBLE_QUOTE = 0x22;
const BACKSLASH = 0x5c;
const LEFT_BRACE = 0x7b;
const RIGHT_BRACE = 0x7d;
const LEFT_BRACKET = 0x5b;
const RIGHT_BRACKET = 0x5d;

export type StrictJsonSequenceIssueCode =
  | "input_invalid_utf8"
  | "input_too_large"
  | "input_frame_invalid"
  | "input_not_json_object"
  | "input_duplicate_key"
  | "attempt_limit_reached";

export type StrictJsonObject = Record<string, unknown>;

export type StrictJsonSequenceResult =
  | Readonly<{ ok: true; value: StrictJsonObject }>
  | Readonly<{ ok: false; issue_code: StrictJsonSequenceIssueCode }>;

type ParserState = "awaiting_record_separator" | "reading_frame" | "terminal" | "finished";
type RootKind = "none" | "container" | "string" | "scalar";

const INVALID_JSON = Symbol("invalid_json");
const DUPLICATE_KEY = Symbol("duplicate_key");

function isJsonWhitespaceCode(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

function isDigitCode(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

function isNonZeroDigitCode(code: number): boolean {
  return code >= 0x31 && code <= 0x39;
}

function isHexCode(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39)
    || (code >= 0x41 && code <= 0x46)
    || (code >= 0x61 && code <= 0x66)
  );
}

function failure(issueCode: StrictJsonSequenceIssueCode): StrictJsonSequenceResult {
  return Object.freeze({ ok: false, issue_code: issueCode });
}

function success(value: StrictJsonObject): StrictJsonSequenceResult {
  return Object.freeze({ ok: true, value });
}

class FrameBoundaryScanner {
  private rootKind: RootKind = "none";
  private readonly expectedClosers: number[] = [];
  private inString = false;
  private escaped = false;
  private rootComplete = false;
  private definitelyInvalid = false;

  canTerminateOnLineFeed(): boolean {
    if (this.rootKind === "none" || this.rootKind === "scalar") {
      return true;
    }
    if (this.definitelyInvalid || this.rootComplete) {
      return true;
    }
    // An unescaped LF can never be part of a valid JSON string.
    return this.inString;
  }

  consume(byte: number): void {
    if (this.rootComplete || this.definitelyInvalid) {
      return;
    }

    if (this.rootKind === "none") {
      if (byte === 0x20 || byte === 0x09 || byte === 0x0d) {
        return;
      }
      if (byte === LEFT_BRACE) {
        this.rootKind = "container";
        this.expectedClosers.push(RIGHT_BRACE);
        return;
      }
      if (byte === LEFT_BRACKET) {
        this.rootKind = "container";
        this.expectedClosers.push(RIGHT_BRACKET);
        return;
      }
      if (byte === DOUBLE_QUOTE) {
        this.rootKind = "string";
        this.inString = true;
        return;
      }
      this.rootKind = "scalar";
      return;
    }

    if (this.rootKind === "scalar") {
      return;
    }

    if (this.inString) {
      if (this.escaped) {
        this.escaped = false;
      } else if (byte === BACKSLASH) {
        this.escaped = true;
      } else if (byte === DOUBLE_QUOTE) {
        this.inString = false;
        if (this.rootKind === "string") {
          this.rootComplete = true;
        }
      }
      return;
    }

    if (byte === DOUBLE_QUOTE) {
      this.inString = true;
      return;
    }
    if (byte === LEFT_BRACE) {
      this.expectedClosers.push(RIGHT_BRACE);
      return;
    }
    if (byte === LEFT_BRACKET) {
      this.expectedClosers.push(RIGHT_BRACKET);
      return;
    }
    if (byte === RIGHT_BRACE || byte === RIGHT_BRACKET) {
      const expected = this.expectedClosers.pop();
      if (byte !== expected) {
        this.definitelyInvalid = true;
        return;
      }
      if (this.expectedClosers.length === 0) {
        this.rootComplete = true;
      }
    }
  }
}

class StrictJsonReader {
  private position = 0;

  constructor(private readonly text: string) {}

  parse(): unknown {
    this.skipWhitespace();
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.position !== this.text.length) {
      throw INVALID_JSON;
    }
    return value;
  }

  private parseValue(containerDepth: number): unknown {
    const code = this.text.charCodeAt(this.position);
    if (code === LEFT_BRACE) {
      return this.parseObject(containerDepth + 1);
    }
    if (code === LEFT_BRACKET) {
      return this.parseArray(containerDepth + 1);
    }
    if (code === DOUBLE_QUOTE) {
      return this.parseString();
    }
    if (code === 0x74) {
      return this.parseLiteral("true", true);
    }
    if (code === 0x66) {
      return this.parseLiteral("false", false);
    }
    if (code === 0x6e) {
      return this.parseLiteral("null", null);
    }
    if (code === 0x2d || isDigitCode(code)) {
      return this.parseNumber();
    }
    throw INVALID_JSON;
  }

  private parseObject(depth: number): StrictJsonObject {
    if (depth > 16) {
      throw INVALID_JSON;
    }
    this.position += 1;
    this.skipWhitespace();

    const result: StrictJsonObject = {};
    const keys = new Set<string>();
    if (this.consumeIf(RIGHT_BRACE)) {
      return result;
    }

    while (true) {
      if (this.text.charCodeAt(this.position) !== DOUBLE_QUOTE) {
        throw INVALID_JSON;
      }
      const key = this.parseString();
      if (keys.has(key)) {
        throw DUPLICATE_KEY;
      }
      keys.add(key);

      this.skipWhitespace();
      this.expect(0x3a);
      this.skipWhitespace();
      const value = this.parseValue(depth);
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });

      this.skipWhitespace();
      if (this.consumeIf(RIGHT_BRACE)) {
        return result;
      }
      this.expect(0x2c);
      this.skipWhitespace();
    }
  }

  private parseArray(depth: number): unknown[] {
    if (depth > 16) {
      throw INVALID_JSON;
    }
    this.position += 1;
    this.skipWhitespace();

    const result: unknown[] = [];
    if (this.consumeIf(RIGHT_BRACKET)) {
      return result;
    }

    while (true) {
      result.push(this.parseValue(depth));
      this.skipWhitespace();
      if (this.consumeIf(RIGHT_BRACKET)) {
        return result;
      }
      this.expect(0x2c);
      this.skipWhitespace();
    }
  }

  private parseString(): string {
    this.expect(DOUBLE_QUOTE);
    let result = "";

    while (this.position < this.text.length) {
      const code = this.text.charCodeAt(this.position);
      this.position += 1;
      if (code === DOUBLE_QUOTE) {
        return result;
      }
      if (code < 0x20) {
        throw INVALID_JSON;
      }
      if (code !== BACKSLASH) {
        result += String.fromCharCode(code);
        continue;
      }

      const escape = this.text.charCodeAt(this.position);
      this.position += 1;
      switch (escape) {
        case DOUBLE_QUOTE:
          result += "\"";
          break;
        case BACKSLASH:
          result += "\\";
          break;
        case 0x2f:
          result += "/";
          break;
        case 0x62:
          result += "\b";
          break;
        case 0x66:
          result += "\f";
          break;
        case 0x6e:
          result += "\n";
          break;
        case 0x72:
          result += "\r";
          break;
        case 0x74:
          result += "\t";
          break;
        case 0x75: {
          const end = this.position + 4;
          if (end > this.text.length) {
            throw INVALID_JSON;
          }
          for (let index = this.position; index < end; index += 1) {
            if (!isHexCode(this.text.charCodeAt(index))) {
              throw INVALID_JSON;
            }
          }
          result += String.fromCharCode(Number.parseInt(this.text.slice(this.position, end), 16));
          this.position = end;
          break;
        }
        default:
          throw INVALID_JSON;
      }
    }
    throw INVALID_JSON;
  }

  private parseNumber(): number {
    const start = this.position;
    if (this.text.charCodeAt(this.position) === 0x2d) {
      this.position += 1;
    }

    const integerStart = this.text.charCodeAt(this.position);
    if (integerStart === 0x30) {
      this.position += 1;
    } else if (isNonZeroDigitCode(integerStart)) {
      this.position += 1;
      while (isDigitCode(this.text.charCodeAt(this.position))) {
        this.position += 1;
      }
    } else {
      throw INVALID_JSON;
    }

    if (this.text.charCodeAt(this.position) === 0x2e) {
      this.position += 1;
      if (!isDigitCode(this.text.charCodeAt(this.position))) {
        throw INVALID_JSON;
      }
      while (isDigitCode(this.text.charCodeAt(this.position))) {
        this.position += 1;
      }
    }

    const exponent = this.text.charCodeAt(this.position);
    if (exponent === 0x45 || exponent === 0x65) {
      this.position += 1;
      const sign = this.text.charCodeAt(this.position);
      if (sign === 0x2b || sign === 0x2d) {
        this.position += 1;
      }
      if (!isDigitCode(this.text.charCodeAt(this.position))) {
        throw INVALID_JSON;
      }
      while (isDigitCode(this.text.charCodeAt(this.position))) {
        this.position += 1;
      }
    }

    const value = Number(this.text.slice(start, this.position));
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw INVALID_JSON;
    }
    return value;
  }

  private parseLiteral<T>(literal: string, value: T): T {
    if (!this.text.startsWith(literal, this.position)) {
      throw INVALID_JSON;
    }
    this.position += literal.length;
    return value;
  }

  private skipWhitespace(): void {
    while (isJsonWhitespaceCode(this.text.charCodeAt(this.position))) {
      this.position += 1;
    }
  }

  private consumeIf(expected: number): boolean {
    if (this.text.charCodeAt(this.position) !== expected) {
      return false;
    }
    this.position += 1;
    return true;
  }

  private expect(expected: number): void {
    if (!this.consumeIf(expected)) {
      throw INVALID_JSON;
    }
  }
}

function parseFrame(bytes: readonly number[]): StrictJsonSequenceResult {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(bytes));
  } catch {
    return failure("input_invalid_utf8");
  }

  try {
    const value = new StrictJsonReader(text).parse();
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return failure("input_not_json_object");
    }
    return success(value as StrictJsonObject);
  } catch (error) {
    if (error === DUPLICATE_KEY) {
      return failure("input_duplicate_key");
    }
    return failure("input_frame_invalid");
  }
}

export class StrictJsonSequenceParser {
  private state: ParserState = "awaiting_record_separator";
  private completedFrames = 0;
  private frameBytes: number[] = [];
  private boundary = new FrameBoundaryScanner();

  push(chunk: Uint8Array): StrictJsonSequenceResult[] {
    if (this.state === "terminal" || this.state === "finished") {
      return [];
    }
    if (!(chunk instanceof Uint8Array)) {
      return this.fail("input_frame_invalid");
    }

    const results: StrictJsonSequenceResult[] = [];
    for (const byte of chunk) {
      if (this.state === "awaiting_record_separator") {
        if (byte !== RECORD_SEPARATOR) {
          results.push(...this.fail("input_frame_invalid"));
          break;
        }
        if (this.completedFrames >= OWNER_N1_MAX_FRAMES) {
          results.push(...this.fail("attempt_limit_reached"));
          break;
        }
        this.state = "reading_frame";
        this.frameBytes = [];
        this.boundary = new FrameBoundaryScanner();
        continue;
      }

      if (byte === RECORD_SEPARATOR) {
        results.push(...this.fail("input_frame_invalid"));
        break;
      }
      if (byte === LINE_FEED && this.boundary.canTerminateOnLineFeed()) {
        const result = parseFrame(this.frameBytes);
        results.push(result);
        if (!result.ok) {
          this.state = "terminal";
          this.clearFrame();
          break;
        }
        this.completedFrames += 1;
        this.state = "awaiting_record_separator";
        this.clearFrame();
        continue;
      }
      if (this.frameBytes.length >= OWNER_N1_MAX_FRAME_BYTES) {
        results.push(...this.fail("input_too_large"));
        break;
      }
      this.frameBytes.push(byte);
      this.boundary.consume(byte);
    }
    return results;
  }

  finish(): StrictJsonSequenceResult[] {
    if (this.state === "terminal" || this.state === "finished") {
      return [];
    }
    if (this.state === "reading_frame" || this.completedFrames === 0) {
      return this.fail("input_frame_invalid");
    }
    this.state = "finished";
    this.clearFrame();
    return [];
  }

  private fail(issueCode: StrictJsonSequenceIssueCode): StrictJsonSequenceResult[] {
    this.state = "terminal";
    this.clearFrame();
    return [failure(issueCode)];
  }

  private clearFrame(): void {
    this.frameBytes = [];
    this.boundary = new FrameBoundaryScanner();
  }
}

export function parseStrictJsonSequence(
  chunks: Uint8Array | Iterable<Uint8Array>,
): StrictJsonSequenceResult[] {
  const parser = new StrictJsonSequenceParser();
  const results: StrictJsonSequenceResult[] = [];
  const inputChunks = chunks instanceof Uint8Array ? [chunks] : chunks;

  for (const chunk of inputChunks) {
    const next = parser.push(chunk);
    results.push(...next);
    if (next.some((result) => !result.ok)) {
      return results;
    }
  }
  results.push(...parser.finish());
  return results;
}
