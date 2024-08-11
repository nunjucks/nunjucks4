import { LRUCache } from "lru-cache";
import nameRe from "./identifiers";

const cache = new LRUCache<string, Lexer>({ max: 50 });

export class TemplateSyntaxError extends Error {
  name = "TemplateSyntaxError";
  lineno: number;
  sourcename?: string | null;
  filename?: string | null;
  source: string | null = null;
  translated: boolean;
  message: string;

  constructor(
    message: string | undefined,
    {
      lineno,
      name = null,
      filename = null,
    }: { lineno?: number; name?: string | null; filename?: string | null } = {},
  ) {
    super(message);
    this.lineno = lineno ?? 0;
    this.sourcename = name;
    this.filename = filename;
    this.translated = false;
    this.message = message ?? "Error";
  }
}

const whitespaceRe = /\s+/g;
const whitespaceFullRe = /^\s+$/;
const newlineRe = /(\r\n|\r|\n)/g;
const stringRe = /('([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)")/gs;

const integerRe = new RegExp(
  `(${[
    "0b(_?[0-1])+", // binary
    "0o(_?[0-7])+", // octal
    "0x(_?[\\da-f])+", // hex
    "[1-9](_?\\d)*", // non-zero decimal
    "0(_?0)*", // decimal zero
  ].join("|")})`,
  "gi",
);

const floatRe = new RegExp(
  [
    "(?<!\\.)", // doesn't start with a .
    "(\\d+_)*\\d+", // digits, possibly _ separated
    "(",
    "(\\.(\\d+_)*\\d+)?", // optional fractional part
    "e[+\\-]?(\\d+_)*\\d+", // exponent part
    "|",
    "\\.(\\d+_)*\\d+", // required fractional part
    ")",
  ].join(""),
  "gi",
);

export const TOKEN_STRING = "string";
export const TOKEN_WHITESPACE = "whitespace";
export const TOKEN_DATA = "data";
export const TOKEN_BLOCK_START = "block_start";
export const TOKEN_BLOCK_END = "block_end";
export const TOKEN_VARIABLE_START = "variable_start";
export const TOKEN_VARIABLE_END = "variable_end";
export const TOKEN_RAW_START = "raw_start";
export const TOKEN_RAW_END = "raw_end";
export const TOKEN_VERBATIM_START = "verbatim_start";
export const TOKEN_VERBATIM_END = "verbatim_end";
export const TOKEN_COMMENT = "comment";
export const TOKEN_COMMENT_START = "comment_start";
export const TOKEN_COMMENT_END = "comment_end";
export const TOKEN_LINESTATEMENT_START = "linestatement_start";
export const TOKEN_LINESTATEMENT_END = "linestatement_end";
export const TOKEN_LINECOMMENT_START = "linecomment_start";
export const TOKEN_LINECOMMENT_END = "linecomment_end";
export const TOKEN_LINECOMMENT = "linecomment";
export const TOKEN_LPAREN = "lparen";
export const TOKEN_RPAREN = "rparen";
export const TOKEN_LBRACKET = "lbracket";
export const TOKEN_RBRACKET = "rbracket";
export const TOKEN_LBRACE = "lbrace";
export const TOKEN_RBRACE = "rbrace";
export const TOKEN_SEMICOLON = "semicolon";
export const TOKEN_OPERATOR = "operator";
export const TOKEN_ADD = "add";
export const TOKEN_SUB = "sub";
export const TOKEN_DIV = "div";
export const TOKEN_FLOORDIV = "floordiv";
export const TOKEN_MUL = "mul";
export const TOKEN_MOD = "mod";
export const TOKEN_POW = "pow";
export const TOKEN_EQ = "eq";
export const TOKEN_NE = "ne";
export const TOKEN_STRICT_EQ = "stricteq";
export const TOKEN_STRICT_NE = "strictne";
export const TOKEN_GT = "gt";
export const TOKEN_GTEQ = "gteq";
export const TOKEN_LT = "lt";
export const TOKEN_LTEQ = "lteq";
export const TOKEN_ASSIGN = "assign";
export const TOKEN_COMMA = "comma";
export const TOKEN_COLON = "colon";
export const TOKEN_DOT = "dot";
export const TOKEN_TILDE = "tilde";
export const TOKEN_PIPE = "pipe";
export const TOKEN_INT = "int";
export const TOKEN_FLOAT = "float";
export const TOKEN_BOOLEAN = "boolean";
export const TOKEN_NONE = "none";
export const TOKEN_NAME = "name";
export const TOKEN_SPECIAL = "special";
export const TOKEN_REGEX = "regex";
export const TOKEN_REGEX_FLAGS = "regex_flags";
export const TOKEN_INITIAL = "initial";
export const TOKEN_EOF = "eof";

export type TokenType =
  | typeof TOKEN_STRING
  | typeof TOKEN_WHITESPACE
  | typeof TOKEN_DATA
  | typeof TOKEN_BLOCK_START
  | typeof TOKEN_BLOCK_END
  | typeof TOKEN_VARIABLE_START
  | typeof TOKEN_VARIABLE_END
  | typeof TOKEN_RAW_START
  | typeof TOKEN_RAW_END
  | typeof TOKEN_VERBATIM_START
  | typeof TOKEN_VERBATIM_END
  | typeof TOKEN_COMMENT
  | typeof TOKEN_COMMENT_START
  | typeof TOKEN_COMMENT_END
  | typeof TOKEN_LINESTATEMENT_START
  | typeof TOKEN_LINESTATEMENT_END
  | typeof TOKEN_LINECOMMENT_START
  | typeof TOKEN_LINECOMMENT_END
  | typeof TOKEN_LINECOMMENT
  | typeof TOKEN_LPAREN
  | typeof TOKEN_RPAREN
  | typeof TOKEN_LBRACKET
  | typeof TOKEN_RBRACKET
  | typeof TOKEN_LBRACE
  | typeof TOKEN_RBRACE
  | typeof TOKEN_SEMICOLON
  | typeof TOKEN_OPERATOR
  | typeof TOKEN_ADD
  | typeof TOKEN_SUB
  | typeof TOKEN_DIV
  | typeof TOKEN_FLOORDIV
  | typeof TOKEN_MUL
  | typeof TOKEN_MOD
  | typeof TOKEN_POW
  | typeof TOKEN_EQ
  | typeof TOKEN_NE
  | typeof TOKEN_STRICT_EQ
  | typeof TOKEN_STRICT_NE
  | typeof TOKEN_GT
  | typeof TOKEN_GTEQ
  | typeof TOKEN_LT
  | typeof TOKEN_LTEQ
  | typeof TOKEN_ASSIGN
  | typeof TOKEN_COMMA
  | typeof TOKEN_COLON
  | typeof TOKEN_DOT
  | typeof TOKEN_TILDE
  | typeof TOKEN_PIPE
  | typeof TOKEN_INT
  | typeof TOKEN_FLOAT
  | typeof TOKEN_BOOLEAN
  | typeof TOKEN_NONE
  | typeof TOKEN_NAME
  | typeof TOKEN_SPECIAL
  | typeof TOKEN_REGEX
  | typeof TOKEN_REGEX_FLAGS
  | typeof TOKEN_INITIAL
  | typeof TOKEN_EOF;

// bind operators to token types
const operators: Record<string, TokenType> = {
  "+": TOKEN_ADD,
  "-": TOKEN_SUB,
  "/": TOKEN_DIV,
  "//": TOKEN_FLOORDIV,
  "*": TOKEN_MUL,
  "%": TOKEN_MOD,
  "**": TOKEN_POW,
  "~": TOKEN_TILDE,
  "[": TOKEN_LBRACKET,
  "]": TOKEN_RBRACKET,
  "(": TOKEN_LPAREN,
  ")": TOKEN_RPAREN,
  "{": TOKEN_LBRACE,
  "}": TOKEN_RBRACE,
  "==": TOKEN_EQ,
  "!=": TOKEN_NE,
  ">": TOKEN_GT,
  ">=": TOKEN_GTEQ,
  "<": TOKEN_LT,
  "<=": TOKEN_LTEQ,
  "=": TOKEN_ASSIGN,
  ".": TOKEN_DOT,
  ":": TOKEN_COLON,
  "|": TOKEN_PIPE,
  ",": TOKEN_COMMA,
  ";": TOKEN_SEMICOLON,
};

export type TokenEof = Token<typeof TOKEN_EOF>;

function isEof(tok: Token): tok is TokenEof {
  return tok.type === TOKEN_EOF;
}

type ReverseMap<T extends Record<keyof T, keyof any>> = {
  [P in T[keyof T]]: {
    [K in keyof T]: T[K] extends P ? K : never;
  }[keyof T];
};

const reverseOperators = Object.fromEntries(
  Object.entries(operators).map(([k, v]) => [v, k]),
) as ReverseMap<typeof operators>;

const regexEscape = (str: string): string =>
  str.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");

const operatorRe = (() => {
  const ops = [...Object.keys(operators)];
  ops.sort((a, b) => b.length - a.length);
  return new RegExp(`(${ops.map((op) => regexEscape(op)).join("|")})`, "g");
})();

const ignoredTokens = new Set<string>([
  TOKEN_COMMENT_START,
  TOKEN_COMMENT,
  TOKEN_COMMENT_END,
  TOKEN_WHITESPACE,
  TOKEN_LINECOMMENT_START,
  TOKEN_LINECOMMENT_END,
  TOKEN_LINECOMMENT,
]);

const ignoreIfEmpty = new Set<string>([
  TOKEN_WHITESPACE,
  TOKEN_DATA,
  TOKEN_COMMENT,
  TOKEN_LINECOMMENT,
]);

const tokenDescriptions = {
  [TOKEN_COMMENT_START]: "begin of comment",
  [TOKEN_COMMENT_END]: "end of comment",
  [TOKEN_COMMENT]: "comment",
  [TOKEN_LINECOMMENT]: "comment",
  [TOKEN_BLOCK_START]: "begin of statement block",
  [TOKEN_BLOCK_END]: "end of statement block",
  [TOKEN_VARIABLE_START]: "begin of print statement",
  [TOKEN_VARIABLE_END]: "end of print statement",
  [TOKEN_LINESTATEMENT_START]: "begin of line statement",
  [TOKEN_LINESTATEMENT_END]: "end of line statement",
  [TOKEN_DATA]: "template data / text",
  [TOKEN_EOF]: "end of template",
} as const;

export interface Token<T extends TokenType = TokenType> {
  type: T;
  value: string;
  lineno: number;
  colno: number;
  pos: number;
  raw: string;
}

export function makeToken<T extends TokenType = TokenType>(
  type: T,
  value: string,
  lineno: number,
  colno: number,
  pos: number,
  raw: string,
): Token<T> {
  return {
    type,
    value,
    lineno,
    colno,
    pos,
    raw,
  };
}

function hasProp<K extends string>(
  value: unknown,
  prop: K,
): value is Record<K, any> {
  return Object.prototype.hasOwnProperty.call(value, prop);
}

export function isToken(value: unknown): value is Token {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (!hasProp(value, "type") || !hasProp(value, "value")) {
    return false;
  }
  return typeof value.type === "string" && typeof value.value === "string";
}

export function assertToken(value: unknown): asserts value is Token {
  if (!isToken(value)) {
    throw new Error("Expected a token");
  }
}

function _describeTokenType(tokenType: string): string {
  if (tokenType in reverseOperators) {
    return reverseOperators[tokenType as keyof typeof reverseOperators];
  }
  if (tokenType in tokenDescriptions) {
    return tokenDescriptions[tokenType as keyof typeof tokenDescriptions];
  }
  return tokenType;
}

function describeToken(token: Token): string {
  return token.type === TOKEN_NAME
    ? token.value
    : _describeTokenType(token.type);
}

function describeTokenExpr(expr: string): string {
  let type = expr;
  let value = "";
  if (expr.includes(":")) {
    [type, value] = expr.split(/:/);
    if (type === TOKEN_NAME) return value;
  }
  return _describeTokenType(type);
}

export class TokenStream implements Iterator<Token, TokenEof> {
  name: string | null;
  filename: string | null;
  _iter: Iterator<Token>;
  _pushed: Token[] = [];
  closed = false;
  current: Token;
  previous: Token | null;
  str: string;

  position = 0;
  lineno = 1;
  colno = 0;

  constructor(
    generator: Iterable<Token>,
    {
      name = null,
      filename = null,
    }: { name?: string | null; filename?: string | null } = {},
  ) {
    this.name = name ?? null;
    this.filename = filename ?? null;
    this.current = makeToken(TOKEN_INITIAL, "", 1, 0, 0, "");
    this.previous = null;
    this._iter = generator[Symbol.iterator]();
    this.next();
  }

  get eos(): boolean {
    return !!this._pushed.length || this.current.type !== TOKEN_EOF;
  }

  push(token: Token) {
    this._pushed.push(token);
  }

  test(token: Token, expr: string): boolean {
    if (token.type === expr) return true;
    if (expr.includes(":")) {
      return expr == `${token.type}:${token.value}`;
    }
    return false;
  }

  testAny(token: Token, arr: string[]): boolean {
    return arr.some((expr) => this.test(token, expr));
  }

  look(): Token {
    const result = this.next();
    if (result.done) {
      throw new Error("look called on a closed token stream");
    }
    const looked = this.current;
    this.push(looked);
    this.previous = looked;
    this.current = result.value;
    return looked;
  }

  close(): void {
    this.previous = this.current;
    this.current = makeToken(
      TOKEN_EOF,
      "",
      this.current.lineno,
      this.current.colno,
      this.current.pos,
      "",
    );
    this._iter = [][Symbol.iterator] as unknown as IterableIterator<Token>;
    this.closed = true;
  }

  [Symbol.iterator]() {
    return this;
  }

  next(): IteratorResult<Token, TokenEof> {
    const value = this.current;
    this.previous = value;
    if (this._pushed.length) {
      this.current = this._pushed.shift()!;
    } else if (this.current.type !== TOKEN_EOF) {
      const result = this._iter.next();
      if (result.done) {
        this.close();
      } else {
        this.current = result.value;
      }
    }
    if (isEof(value)) {
      return { done: true, value };
    } else {
      return { done: false, value };
    }
  }

  skip(n: number = 1) {
    for (let i = 0; i < n; i++) {
      this.next();
    }
  }

  nextIf(expr: string): Token | null {
    if (this.test(this.current, expr)) {
      const result = this.next();
      return result.done ? null : result.value;
    }
    return null;
  }

  skipIf(expr: string): boolean {
    return this.nextIf(expr) !== null;
  }

  expect(expr: string): Token {
    const tok = this.current;
    if (!this.test(tok, expr)) {
      const expected = describeTokenExpr(expr);
      if (this.current.type === TOKEN_EOF) {
        throw new TemplateSyntaxError(
          `unexpected end of template, expected '${expected}'`,
          { lineno: this.lineno, name: this.name, filename: this.filename },
        );
      }
      throw new TemplateSyntaxError(
        `expected '${expected}', got '${describeToken(tok)}'`,
        {
          lineno: this.current.lineno,
          name: this.name,
          filename: this.filename,
        },
      );
    }
    this.next();
    return tok;
  }
}
const BLOCK_START = "{%";
const BLOCK_END = "%}";
const VARIABLE_START = "{{";
const VARIABLE_END = "}}";
const COMMENT_START = "{#";
const COMMENT_END = "#}";

export interface LexerOptions {
  blockStart: string;
  blockEnd: string;
  variableStart: string;
  variableEnd: string;
  commentStart: string;
  commentEnd: string;
  lineStatementPrefix: string | null;
  lineCommentPrefix: string | null;
  trimBlocks: boolean;
  lstripBlocks: boolean;
  newlineSequence: string | null;
  keepTrailingNewline: boolean;
}

function compileRules(opts: LexerOptions): [string, string][] {
  const e = regexEscape;
  const rules: [number, string, string][] = [
    [opts.commentStart.length, TOKEN_COMMENT_START, e(opts.commentStart)],
    [opts.blockStart.length, TOKEN_BLOCK_START, e(opts.blockStart)],
    [opts.variableStart.length, TOKEN_VARIABLE_START, e(opts.variableStart)],
  ];
  if (opts.lineStatementPrefix !== null) {
    rules.push([
      opts.lineStatementPrefix.length,
      TOKEN_LINESTATEMENT_START,
      "^[ \\t\\v]*" + e(opts.lineStatementPrefix),
    ]);
  }
  if (opts.lineCommentPrefix !== null) {
    rules.push([
      opts.lineCommentPrefix.length,
      TOKEN_LINECOMMENT_START,
      "(?:^|(?<=\\S))[^\\S\\r\\n]*" + e(opts.lineCommentPrefix),
    ]);
  }
  return rules
    .sort()
    .reverse()
    .map(([, tok, regex]) => [tok, regex]);
}

interface Rule {
  regex: RegExp;
  tokens: TokenType | (TokenType | "#bygroup")[] | [Failure];
  command?: string;
}

class Failure {
  message: string;
  exceptionClass: typeof TemplateSyntaxError;
  constructor(
    message: string,
    {
      exceptionClass = TemplateSyntaxError,
    }: { exceptionClass?: typeof TemplateSyntaxError } = {},
  ) {
    this.message = message;
    this.exceptionClass = exceptionClass;
  }

  raise(lineno: number, filename: string | null): never {
    throw new this.exceptionClass(this.message, { lineno, filename });
  }
}

type OptionalLStrip = (TokenType | "#bygroup")[] & {
  __optionalLStrip: boolean;
};

function optionalLStrip(arr: (TokenType | "#bygroup")[]): OptionalLStrip {
  return Object.assign(arr, { __optionalLStrip: true });
}

function isOptionalLStrip(tokens: unknown): tokens is OptionalLStrip {
  return (
    Array.isArray(tokens) &&
    Object.prototype.hasOwnProperty.call(tokens, "__optionalLStrip")
  );
}

function rule(
  regex: RegExp,
  tokens: TokenType | (TokenType | "#bygroup")[] | [Failure],
  command?: string,
): Rule {
  return { regex, tokens, command };
}

class SourcePosition {
  linePos: number[];

  constructor(text: string) {
    const nl = /\n\r?|\r/g;
    this.linePos = [0];
    while (nl.exec(text)) {
      this.linePos.push(nl.lastIndex);
    }
    if (this.linePos[this.linePos.length - 1] != text.length) {
      this.linePos.push(text.length);
    }
  }

  /** Find the line and column of the given source location. */
  lookup(sourcePos: number): { lineno: number; colno: number } | null {
    if (sourcePos < 0) {
      return null;
    }
    let i = 1;
    while (i < this.linePos.length && sourcePos >= this.linePos[i]) {
      i++;
    }
    return { lineno: i, colno: sourcePos - this.linePos[i - 1] };
  }
}

export class Lexer {
  trimBlocks: boolean;
  lstripBlocks: boolean;
  newlineSequence: string | null;
  keepTrailingNewline: boolean;

  rules: Record<string, Rule[]>;

  options: LexerOptions;

  tags: {
    BLOCK_START: string;
    BLOCK_END: string;
    VARIABLE_START: string;
    VARIABLE_END: string;
    COMMENT_START: string;
    COMMENT_END: string;
    LINE_COMENT_PREFIX: string | null;
    LINE_STATEMENT_PREFIX: string | null;
  };

  constructor(opts: Partial<LexerOptions> = {}) {
    this.options = {
      blockStart: opts.blockStart ?? BLOCK_START,
      blockEnd: opts.blockEnd ?? BLOCK_END,
      variableStart: opts.variableStart ?? VARIABLE_START,
      variableEnd: opts.variableEnd ?? VARIABLE_END,
      commentStart: opts.commentStart ?? COMMENT_START,
      commentEnd: opts.commentEnd ?? COMMENT_END,
      lineCommentPrefix: opts.lineCommentPrefix ?? null,
      lineStatementPrefix: opts.lineStatementPrefix ?? null,
      newlineSequence: opts.newlineSequence ?? null,
      trimBlocks: !!opts.trimBlocks,
      lstripBlocks: !!opts.lstripBlocks,
      keepTrailingNewline: opts.keepTrailingNewline ?? false,
    };
    this.tags = {
      BLOCK_START: opts.blockStart ?? BLOCK_START,
      BLOCK_END: opts.blockEnd ?? BLOCK_END,
      VARIABLE_START: opts.variableStart ?? VARIABLE_START,
      VARIABLE_END: opts.variableEnd ?? VARIABLE_END,
      COMMENT_START: opts.commentStart ?? COMMENT_START,
      COMMENT_END: opts.commentEnd ?? COMMENT_END,
      LINE_COMENT_PREFIX: opts.lineCommentPrefix ?? null,
      LINE_STATEMENT_PREFIX: opts.lineStatementPrefix ?? null,
    };
    this.newlineSequence = opts.newlineSequence ?? null;
    this.trimBlocks = !!opts.trimBlocks;
    this.lstripBlocks = !!opts.lstripBlocks;
    this.keepTrailingNewline = opts.keepTrailingNewline ?? false;

    const e = regexEscape;
    const c = (s: string) => new RegExp(s, "gms");

    const tagRules: Rule[] = [
      rule(whitespaceRe, TOKEN_WHITESPACE),
      rule(floatRe, TOKEN_FLOAT),
      rule(integerRe, TOKEN_INT),
      rule(nameRe, TOKEN_NAME),
      rule(stringRe, TOKEN_STRING),
      rule(operatorRe, TOKEN_OPERATOR),
    ];

    const rootTagRules = compileRules(this.options);

    const blockStartRe = e(this.options.blockStart);
    const blockEndRe = e(this.options.blockEnd);
    const commentEndRe = e(this.options.commentEnd);
    const variableEndRe = e(this.options.variableEnd);

    const blockSuffixRe = this.options.trimBlocks ? "\\n?" : "";

    const rootRawRe = [
      `(?<raw_start>${blockStartRe}(\\-|\\+|)\\s*raw\\s*`,
      `(?:\\-${blockEndRe}\\s*|${blockEndRe}))`,
    ].join("");
    const rootVerbatimRe = [
      `(?<verbatim_start>${blockStartRe}(\\-|\\+|)\\s*verbatim\\s*`,
      `(?:\\-${blockEndRe}\\s*|${blockEndRe}))`,
    ].join("");

    const rootPartsRe = [
      rootRawRe,
      rootVerbatimRe,
      ...rootTagRules.map(([n, r]) => `(?<${n}>${r}(\\-|\\+|))`),
    ].join("|");

    this.rules = {
      root: [
        // directives
        rule(
          c(`(.*?)(?:${rootPartsRe})`),
          optionalLStrip([TOKEN_DATA, "#bygroup"]),
          "#bygroup",
        ),
        // data
        rule(c(".+"), TOKEN_DATA),
      ],
      // comments
      [TOKEN_COMMENT_START]: [
        rule(
          c(
            [
              `(.*?)((?:\\+${commentEndRe}|\\-${commentEndRe}\\s*`,
              `|${commentEndRe}${blockSuffixRe}))`,
            ].join(""),
          ),
          [TOKEN_COMMENT, TOKEN_COMMENT_END],
          "#pop",
        ),
        rule(c("(.)"), [new Failure("Missing end of comment tag")]),
      ],
      // blocks
      [TOKEN_BLOCK_START]: [
        rule(
          c(
            [
              `(?:\\+${blockEndRe}|\\-${blockEndRe}\\s*`,
              `|${blockEndRe}${blockSuffixRe})`,
            ].join(""),
          ),
          TOKEN_BLOCK_END,
          "#pop",
        ),
        ...tagRules,
      ],
      // variables
      [TOKEN_VARIABLE_START]: [
        rule(
          c(`\\-${variableEndRe}\\s*|${variableEndRe}`),
          TOKEN_VARIABLE_END,
          "#pop",
        ),
        ...tagRules,
      ],
      // raw block
      [TOKEN_RAW_START]: [
        rule(
          c(
            [
              `(.*?)((?:${blockStartRe}(\\-|\\+|))\\s*endraw\\s*`,
              `(?:\\+${blockEndRe}|\\-${blockEndRe}\\s*`,
              `|${blockEndRe}${blockSuffixRe}))`,
            ].join(""),
          ),
          optionalLStrip([TOKEN_DATA, TOKEN_RAW_END]),
          "#pop",
        ),
        rule(c("(.)"), [new Failure("Missing end of raw directive")]),
      ],
      // verbatim block (alias for raw)
      [TOKEN_VERBATIM_START]: [
        rule(
          c(
            [
              `(.*?)((?:${blockStartRe}(\\-|\\+|))\\s*endverbatim\\s*`,
              `(?:\\+${blockEndRe}|\\-${blockEndRe}\\s*`,
              `|${blockEndRe}${blockSuffixRe}))`,
            ].join(""),
          ),
          optionalLStrip([TOKEN_DATA, TOKEN_VERBATIM_END]),
          "#pop",
        ),
        rule(c("(.)"), [new Failure("Missing end of verbatim directive")]),
      ],
      // line statements
      [TOKEN_LINESTATEMENT_START]: [
        rule(c("\\s*(\\n|$)"), TOKEN_LINESTATEMENT_END, "#pop"),
        ...tagRules,
      ],
      // line comments
      [TOKEN_LINECOMMENT_START]: [
        rule(
          c("(.*?)()(?=\\n|$)"),
          [TOKEN_LINECOMMENT, TOKEN_LINECOMMENT_END],
          "#pop",
        ),
      ],
    };
  }

  _normalizeNewlines(value: string): string {
    return value.replace(newlineRe, this.newlineSequence ?? "\n");
  }

  tokenize(
    source: string,
    {
      name,
      filename = null,
      state = null,
    }: {
      name?: string | null;
      filename?: string | null;
      state?: string | null;
    } = {},
  ): TokenStream {
    const stream = this.tokeniter(source, { name, filename, state });
    return Object.assign(
      new TokenStream(this.wrap(stream), {
        name: name ?? undefined,
        filename: filename ?? undefined,
      }),
      { str: source },
    );
  }

  *wrap(
    stream: Iterable<[number, number, string, string, number, string]>,
  ): Iterable<Token> {
    for (const [lineno, colno, token_, valueStr, pos, raw] of stream) {
      let token = token_;
      if (ignoredTokens.has(token)) continue;

      let value: any = valueStr;

      if (token === TOKEN_LINESTATEMENT_START) {
        token = TOKEN_BLOCK_START;
      } else if (token === TOKEN_LINESTATEMENT_END) {
        token = TOKEN_BLOCK_END;
        // we are not interested in those tokens in the parser
      } else if (token === TOKEN_RAW_START || token === TOKEN_RAW_END) {
        continue;
      } else if (
        token === TOKEN_VERBATIM_START ||
        token === TOKEN_VERBATIM_END
      ) {
        continue;
      } else if (token === TOKEN_DATA) {
        value = this._normalizeNewlines(valueStr);
      } else if (token === "keyword") {
        token = valueStr;
      } else if (token === TOKEN_NAME) {
        value = valueStr;
      } else if (token === TOKEN_STRING) {
        // TODO unicode unescape string?
        value = this._normalizeNewlines(
          valueStr.substring(1, valueStr.length - 1),
        );
      } else if (token === TOKEN_INT || token === TOKEN_FLOAT) {
        value = Number(valueStr.replace(/_/g, ""));
      } else if (token === TOKEN_OPERATOR) {
        token = operators[valueStr];
      }
      yield makeToken(token as TokenType, value, lineno, colno, pos, raw);
    }
  }

  *tokeniter(
    source: string,
    {
      name,
      filename = null,
      state = null,
    }: {
      name?: string | null;
      filename?: string | null;
      state?: string | null;
    } = {},
  ): Iterable<[number, number, string, string, number, string]> {
    const lines = source.split(newlineRe).filter((_, i) => i % 2 === 0);
    if (!this.keepTrailingNewline && lines[lines.length - 1] === "") {
      lines.pop();
    }

    source = lines.join("\n");

    const sourcePositions = new SourcePosition(source);

    let pos = 0;
    let lineno = 1;
    let colno = 0;
    const stack: string[] = ["root"];

    if (state !== null && state !== "root") {
      if (state !== "variable" && state !== "block") {
        throw new Error("invalid state");
      }
      stack.push(`${state}_start`);
    }

    let statetokens = this.rules[stack[stack.length - 1]];
    const sourceLength = source.length;
    const balancingStack: string[] = [];
    let lineStarting = true;

    while (true) {
      let hasBreak;
      for (const { regex, tokens, command: newState } of statetokens) {
        hasBreak = false;
        regex.lastIndex = pos;
        const m = regex.exec(source);

        if (m === null || m.index !== pos) continue;

        // we only match blocks and variables if braces / parentheses
        // are balanced. continue parsing with the lower rule which
        // is the operator rule. do this only if the end tags look
        // like operators
        if (
          balancingStack.length &&
          (tokens === TOKEN_VARIABLE_END ||
            tokens === TOKEN_BLOCK_END ||
            tokens === TOKEN_LINESTATEMENT_END)
        ) {
          continue;
        }

        if (Array.isArray(tokens)) {
          const groups = [...m].slice(1);
          if (isOptionalLStrip(tokens)) {
            // Rule supports lstrip. Match will look like
            // text, block type, whitespace control, type, control, ...
            const text = groups[0];
            // Skipping the text and first type, every other group is the
            // whitespace control for each type. One of the groups will be
            // -, +, or empty string instead of None.
            const stripSign = groups.find(
              (g, i) => i >= 2 && i % 2 === 0 && !!g,
            );
            if (stripSign === "-") {
              // Strip all whitespace between the text and the tag.
              const stripped = text.trimEnd();
              groups[0] = stripped;
            } else if (
              // Not marked for preserving whitespace.
              stripSign !== "+" &&
              // lstrip is enabled
              this.lstripBlocks &&
              // Not a variable expression
              !m.groups?.[TOKEN_VARIABLE_START]
            ) {
              // The start of text between the last newline and the tag.
              const lPos = text.lastIndexOf("\n") + 1;
              if (lPos > 0 || lineStarting) {
                // If there's only whitespace between the newline and the
                // tag, strip it.
                whitespaceFullRe.lastIndex = lPos;
                if (whitespaceFullRe.exec(text)) {
                  groups[0] = text.substring(0, lPos);
                }
              }
            }
          }
          let idx = 0;
          for (const token of tokens) {
            const data = groups[idx];
            idx++;
            if (token instanceof Failure) {
              token.raise(lineno, filename);
            } else if (token === "#bygroup") {
              // bygroup is a bit more complex, in that case we
              // yield for the current token the first named
              // group that matched
              if (!m.groups) {
                throw new Error(
                  `'${regex} wanted to resolve the token dynamically ` +
                    "but no group matched",
                );
              }
              for (const [key, value] of Object.entries(m.groups)) {
                if (value) {
                  const matchPos = source.slice(m.index).indexOf(value);
                  const index =
                    matchPos >= 0 && matchPos < m[0].length
                      ? m.index + matchPos
                      : m.index;
                  ({ lineno, colno } = sourcePositions.lookup(index)!);
                  yield [lineno, colno, key, value, index, value];
                  break;
                }
              }
            } else {
              // normal group
              if (data || !ignoreIfEmpty.has(token)) {
                const matchPos = data ? source.slice(m.index).indexOf(data) : 0;
                const index =
                  matchPos >= 0 && matchPos < m[0].length
                    ? m.index + matchPos
                    : m.index;
                ({ lineno, colno } = sourcePositions.lookup(index)!);
                yield [lineno, colno, token, data, index, data];
              }
            }
          }
        } else {
          // strings as tokens are yielded as-is
          const data = m[0];

          // update brace/parentheses balance
          if (tokens === TOKEN_OPERATOR) {
            if (data === "{") {
              balancingStack.push("}");
            } else if (data === "(") {
              balancingStack.push(")");
            } else if (data === "[") {
              balancingStack.push("]");
            } else if (data === "}" || data === ")" || data === "]") {
              if (!balancingStack.length) {
                throw new TemplateSyntaxError(`unexpected '${data}'`, {
                  lineno,
                  name,
                  filename,
                });
              }
              const expectedOp = balancingStack.pop()!;

              if (expectedOp !== data)
                throw new TemplateSyntaxError(
                  `unexpected '${data}', expected '${expectedOp}'`,
                  { lineno, name, filename },
                );
            }
          }
          // yield items
          if (data || !ignoreIfEmpty.has(tokens)) {
            ({ lineno, colno } = sourcePositions.lookup(m.index)!);
            yield [lineno, colno, tokens, data, m.index, m[0]];
          }
        }

        lineStarting = (m[0] ?? "").endsWith("\n");

        // fetch new position into new variable so that we can check
        // if there is a internal parsing error which would result
        // in an infinite loop
        const pos2 = regex.lastIndex;

        // handle state changes
        if (newState) {
          // remove the uppermost state
          if (newState === "#pop") {
            stack.pop();
            // resolve the new state by group checking
          } else if (newState === "#bygroup") {
            if (!m.groups)
              throw new Error(
                `'${regex} wanted to resolve the token dynamically ` +
                  "but no group matched",
              );
            for (const [key, value] of Object.entries(m.groups)) {
              if (value) {
                stack.push(key);
                break;
              }
            }
            // direct state name given
          } else {
            stack.push(newState);
          }

          statetokens = this.rules[stack[stack.length - 1]];

          // we are still at the same position and no stack change.
          // this means a loop without break condition, avoid that and
          // raise error
        } else if (pos2 === pos) {
          throw new Error(
            `'${regex}' yielded empty string without stack change`,
          );
        }

        // publish new function and start again
        pos = pos2;
        hasBreak = true;
        break;
      }
      // if loop terminated without break we haven't found a single match
      // either we are at the end of the file or we have a problem
      if (!hasBreak) {
        // end of text
        if (pos >= sourceLength) {
          return;
        }

        // something went wrong
        throw new TemplateSyntaxError(
          `unexpected char '${source[pos]}' at ${pos}`,
        );
      }
    }
  }
}

export function getLexer(opts: Partial<LexerOptions> = {}): Lexer {
  const options: LexerOptions = {
    blockStart: opts.blockStart ?? "{%",
    blockEnd: opts.blockEnd ?? "%}",
    variableStart: opts.variableStart ?? "{{",
    variableEnd: opts.variableEnd ?? "}}",
    commentStart: opts.commentStart ?? "{#",
    commentEnd: opts.commentEnd ?? "#}",
    trimBlocks: opts.trimBlocks ?? false,
    lstripBlocks: opts.lstripBlocks ?? false,
    lineCommentPrefix: opts.lineCommentPrefix ?? null,
    lineStatementPrefix: opts.lineStatementPrefix ?? null,
    keepTrailingNewline: opts.keepTrailingNewline ?? false,
    newlineSequence: opts.newlineSequence ?? "\n",
  };

  const key = [...Object.values(options)].map((v) => `${v}`).join("|");
  const lookup = cache.get(key);
  if (typeof lookup !== "undefined") {
    return lookup;
  }
  const lexer = new Lexer(options);
  cache.set(key, lexer);
  return lexer;
}

export function lex(src: string, opts?: Partial<LexerOptions>): TokenStream {
  const lexer = getLexer(opts);
  const stream = lexer.tokenize(src);
  stream.str = src;
  return stream;
}
