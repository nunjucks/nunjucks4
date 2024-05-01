"use strict";

const whitespaceChars = " \n\t\r\u00A0";
const delimChars = "()[]{}%*-+~/#,:|.<>=!";
const intChars = "0123456789";

const BLOCK_START = "{%";
const BLOCK_END = "%}";
const VARIABLE_START = "{{";
const VARIABLE_END = "}}";
const COMMENT_START = "{#";
const COMMENT_END = "#}";

export const TOKEN_STRING = "string";
export const TOKEN_WHITESPACE = "whitespace";
export const TOKEN_DATA = "data";
export const TOKEN_BLOCK_START = "block-start";
export const TOKEN_BLOCK_END = "block-end";
export const TOKEN_VARIABLE_START = "variable-start";
export const TOKEN_VARIABLE_END = "variable-end";
export const TOKEN_COMMENT = "comment";
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
export const TOKEN_REGEX_FLAGS = "regex-flags";
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
  | typeof TOKEN_COMMENT
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

export class TemplateSyntaxError extends Error {
  name = "TemplateSyntaxError";
  lineno: number;
  sourcename?: string | null;
  filename?: string | null;
  source: string | null = null;
  translated: boolean;

  constructor(
    message: string,
    {
      lineno,
      name = null,
      filename = null,
    }: { lineno: number; name?: string | null; filename?: string | null },
  ) {
    super(message);
    this.lineno = lineno;
    this.sourcename = name;
    this.filename = filename;
    this.translated = false;
  }
}

export type Token<T extends TokenType = TokenType> = {
  type: T;
  value: string;
  lineno: number;
  colno: number;
  pos: number;
};

function token<T extends TokenType = TokenType>(
  type: T,
  value: string,
  lineno: number,
  colno: number,
  pos: number,
): Token<T> {
  return {
    type,
    value,
    lineno,
    colno,
    pos,
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

export type TokenizerOptions = {
  tags?: {
    blockStart?: string;
    blockEnd?: string;
    variableStart?: string;
    variableEnd?: string;
    commentStart?: string;
    commentEnd?: string;
  };
  trimBlocks?: boolean;
  lstripBlocks?: boolean;
};

export class Tokenizer {
  str: string;
  index: number;
  len: number;
  lineno: number;
  colno: number;
  currentToken: Token;

  inCode: boolean;
  trimBlocks: boolean;
  lstripBlocks: boolean;

  tags: {
    BLOCK_START: string;
    BLOCK_END: string;
    VARIABLE_START: string;
    VARIABLE_END: string;
    COMMENT_START: string;
    COMMENT_END: string;
  };

  _pushed: Token[];

  constructor(str: string, options?: TokenizerOptions) {
    this.str = str;
    this.index = 0;
    this.len = str.length;
    this.lineno = 1;
    this.colno = 0;
    this.currentToken = token(
      TOKEN_INITIAL,
      "",
      this.lineno,
      this.colno,
      this.index,
    );

    this.inCode = false;
    this._pushed = [];

    const opts: TokenizerOptions = options || {};

    const tags = opts.tags || {};
    this.tags = {
      BLOCK_START: tags.blockStart || BLOCK_START,
      BLOCK_END: tags.blockEnd || BLOCK_END,
      VARIABLE_START: tags.variableStart || VARIABLE_START,
      VARIABLE_END: tags.variableEnd || VARIABLE_END,
      COMMENT_START: tags.commentStart || COMMENT_START,
      COMMENT_END: tags.commentEnd || COMMENT_END,
    };

    this.trimBlocks = !!opts.trimBlocks;
    this.lstripBlocks = !!opts.lstripBlocks;
  }

  pushToken(tok: Token): void {
    this._pushed.push(tok);
  }

  peekToken(): Token {
    let peeked;
    if (this._pushed.length) {
      peeked = this._pushed[0];
    } else {
      peeked = this._nextToken();
      this.pushToken(peeked);
    }
    return peeked;
  }

  nextToken(): Token {
    if (this._pushed.length) {
      this.currentToken = this._pushed.shift() as Token;
    } else {
      this.currentToken = this._nextToken();
    }
    return this.currentToken;
  }

  _nextToken(): Token {
    const lineno = this.lineno;
    const colno = this.colno;
    const pos = this.index;
    let tok = "";

    if (this.inCode) {
      // Otherwise, if we are in a block parse it as code
      let cur = this.current();

      if (this.isFinished()) {
        // We have nothing else to parse
        return token(TOKEN_EOF, "", lineno, colno, pos);
      } else if (cur === '"' || cur === "'") {
        // We've hit a string
        return token(TOKEN_STRING, this._parseString(cur), lineno, colno, pos);
      } else if ((tok = this._extract(whitespaceChars))) {
        // We hit some whitespace
        return token(TOKEN_WHITESPACE, tok, lineno, colno, pos);
      } else if (
        (tok = this._extractString(this.tags.BLOCK_END)) ||
        (tok = this._extractString("-" + this.tags.BLOCK_END))
      ) {
        // Special check for the block end tag
        //
        // It is a requirement that start and end tags are composed of
        // delimiter characters (%{}[] etc), and our code always
        // breaks on delimiters so we can assume the token parsing
        // doesn't consume these elsewhere
        this.inCode = false;
        if (this.trimBlocks) {
          cur = this.current();
          if (cur === "\n") {
            // Skip newline
            this.forward();
          } else if (cur === "\r") {
            // Skip CRLF newline
            this.forward();
            cur = this.current();
            if (cur === "\n") {
              this.forward();
            } else {
              // Was not a CRLF, so go back
              this.back();
            }
          }
        }
        if (tok[0] === "-") {
          this._extract(whitespaceChars);
        }
        return token(TOKEN_BLOCK_END, tok, lineno, colno, pos);
      } else if (
        (tok = this._extractString(this.tags.VARIABLE_END)) ||
        (tok = this._extractString("-" + this.tags.VARIABLE_END))
      ) {
        // Special check for variable end tag (see above)
        this.inCode = false;
        return token(TOKEN_VARIABLE_END, tok, lineno, colno, pos);
      } else if (cur === "r" && this.str.charAt(this.index + 1) === "/") {
        // Skip past 'r/'.
        this.forwardN(2);

        // Extract until the end of the regex -- / ends it, \/ does not.
        let regexBody = "";
        while (!this.isFinished()) {
          if (this.current() === "/" && this.previous() !== "\\") {
            this.forward();
            break;
          } else {
            regexBody += this.current();
            this.forward();
          }
        }

        // Check for flags.
        // The possible flags are according to https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/RegExp)
        const POSSIBLE_FLAGS = ["g", "i", "m", "y"];
        const flagStartPos = {
          lineno: this.lineno,
          colno: this.colno,
          pos: this.index,
        };
        let regexFlags = "";
        while (!this.isFinished()) {
          const isCurrentAFlag = POSSIBLE_FLAGS.indexOf(this.current()) !== -1;
          if (isCurrentAFlag) {
            regexFlags += this.current();
            this.forward();
          } else {
            break;
          }
        }

        if (regexFlags) {
          this.pushToken(
            token(
              TOKEN_REGEX_FLAGS,
              regexFlags,
              flagStartPos.lineno,
              flagStartPos.colno,
              flagStartPos.pos,
            ),
          );
        }

        return token(TOKEN_REGEX, regexBody, lineno, colno, pos);
      } else if (delimChars.indexOf(cur) !== -1) {
        // We've hit a delimiter (a special char like a bracket)
        this.forward();
        const complexOps = ["==", "===", "!=", "!==", "<=", ">=", "//", "**"];
        const curComplex = cur + this.current();
        let type: TokenType;

        if (complexOps.indexOf(curComplex) !== -1) {
          this.forward();
          cur = curComplex;

          // See if this is a strict equality/inequality comparator
          if (complexOps.indexOf(curComplex + this.current()) !== -1) {
            cur = curComplex + this.current();
            this.forward();
          }
        }

        switch (cur) {
          case "(":
            type = TOKEN_LPAREN;
            break;
          case ")":
            type = TOKEN_RPAREN;
            break;
          case "[":
            type = TOKEN_LBRACKET;
            break;
          case "]":
            type = TOKEN_RBRACKET;
            break;
          case "{":
            type = TOKEN_LBRACE;
            break;
          case "}":
            type = TOKEN_RBRACE;
            break;
          case ",":
            type = TOKEN_COMMA;
            break;
          case ":":
            type = TOKEN_COLON;
            break;
          case "~":
            type = TOKEN_TILDE;
            break;
          case "|":
            type = TOKEN_PIPE;
            break;
          case ".":
            type = TOKEN_DOT;
            break;
          case "=":
            type = TOKEN_ASSIGN;
            break;
          case "+":
            type = TOKEN_ADD;
            break;
          case "-":
            type = TOKEN_SUB;
            break;
          case "/":
            type = TOKEN_DIV;
            break;
          case "//":
            type = TOKEN_FLOORDIV;
            break;
          case "*":
            type = TOKEN_MUL;
            break;
          case "%":
            type = TOKEN_MOD;
            break;
          case "**":
            type = TOKEN_POW;
            break;
          case "==":
            type = TOKEN_EQ;
            break;
          case "!=":
            type = TOKEN_NE;
            break;
          case ">":
            type = TOKEN_GT;
            break;
          case ">=":
            type = TOKEN_GTEQ;
            break;
          case "<":
            type = TOKEN_LT;
            break;
          case "<=":
            type = TOKEN_LTEQ;
            break;
          case ";":
            type = TOKEN_SEMICOLON;
            break;
          case "===":
            type = TOKEN_STRICT_EQ;
            break;
          case "!==":
            type = TOKEN_STRICT_NE;
            break;
          default:
            type = TOKEN_OPERATOR;
        }

        return token(type, cur, lineno, colno, pos);
      } else {
        // We are not at whitespace or a delimiter, so extract the
        // text and parse it
        tok = this._extractUntil(whitespaceChars + delimChars);

        if (tok.match(/^[-+]?[0-9]+$/)) {
          if (this.current() === ".") {
            this.forward();
            const dec = this._extract(intChars);
            return token(TOKEN_FLOAT, tok + "." + dec, lineno, colno, pos);
          } else {
            return token(TOKEN_INT, tok, lineno, colno, pos);
          }
        } else if (tok.match(/^(true|false)$/)) {
          return token(TOKEN_NAME, tok, lineno, colno, pos);
        } else if (tok === "none") {
          return token(TOKEN_NAME, tok, lineno, colno, pos);
          /*
           * Added to make the test `null is null` evaluate truthily.
           * Otherwise, Nunjucks will look up null in the context and
           * return `undefined`, which is not what we want. This *may* have
           * consequences is someone is using null in their templates as a
           * variable.
           */
        } else if (tok === "null") {
          return token(TOKEN_NAME, tok, lineno, colno, pos);
        } else if (tok) {
          return token(TOKEN_NAME, tok, lineno, colno, pos);
        } else {
          throw new TemplateSyntaxError(
            "Unexpected value while parsing: " + tok,
            { lineno: this.lineno },
          );
        }
      }
    } else {
      // Parse out the template text, breaking on tag
      // delimiters because we need to look for block/variable start
      // tags (don't use the full delimChars for optimization)
      const beginChars =
        this.tags.BLOCK_START.charAt(0) +
        this.tags.VARIABLE_START.charAt(0) +
        this.tags.COMMENT_START.charAt(0) +
        this.tags.COMMENT_END.charAt(0);

      if (this.isFinished()) {
        return token(TOKEN_EOF, "", lineno, colno, pos);
      } else if (
        (tok = this._extractString(this.tags.BLOCK_START + "-")) ||
        (tok = this._extractString(this.tags.BLOCK_START))
      ) {
        this.inCode = true;
        return token(TOKEN_BLOCK_START, tok, lineno, colno, pos);
      } else if (
        (tok = this._extractString(this.tags.VARIABLE_START + "-")) ||
        (tok = this._extractString(this.tags.VARIABLE_START))
      ) {
        this.inCode = true;
        return token(TOKEN_VARIABLE_START, tok, lineno, colno, pos);
      } else {
        tok = "";
        let data;
        let inComment = false;

        if (this._matches(this.tags.COMMENT_START)) {
          inComment = true;
          tok = this._extractString(this.tags.COMMENT_START);
        }

        // Continually consume text, breaking on the tag delimiter
        // characters and checking to see if it's a start tag.
        //
        // We could hit the end of the template in the middle of
        // our looping, so check for the null return value from
        // _extractUntil
        while (
          !this.isFinished() &&
          (data = this._extractUntil(beginChars)) !== null
        ) {
          tok += data;

          if (
            (this._matches(this.tags.BLOCK_START) ||
              this._matches(this.tags.VARIABLE_START) ||
              this._matches(this.tags.COMMENT_START)) &&
            !inComment
          ) {
            if (
              this.lstripBlocks &&
              this._matches(this.tags.BLOCK_START) &&
              this.colno > 0 &&
              this.colno <= tok.length
            ) {
              const lastLine = tok.slice(-this.colno);
              if (/^\s+$/.test(lastLine)) {
                // Remove block leading whitespace from beginning of the string
                tok = tok.slice(0, -this.colno);
                if (!tok.length) {
                  // All data removed, collapse to avoid unnecessary nodes
                  // by returning next token (block start)
                  return this.nextToken();
                }
              }
            }
            // If it is a start tag, stop looping
            break;
          } else if (this._matches(this.tags.COMMENT_END)) {
            if (!inComment) {
              throw new TemplateSyntaxError("unexpected end of comment", {
                lineno: this.lineno,
              });
            }
            tok += this._extractString(this.tags.COMMENT_END);
            break;
          } else {
            // It does not match any tag, so add the character and
            // carry on
            tok += this.current();
            this.forward();
          }
        }

        if (data === null && inComment) {
          throw new TemplateSyntaxError(
            "expected end of comment, got end of file",
            { lineno: this.lineno },
          );
        }

        if (!inComment && this._matches(this.tags.BLOCK_START + "-")) {
          // If the next token is a left-stripping block tag, strip trailing
          // whitespace
          tok = tok.replace(/\s+$/, "");
          // If the token is now empty, skip and return the next
          if (!tok) return this._nextToken();
        }

        return token(
          inComment ? TOKEN_COMMENT : TOKEN_DATA,
          tok,
          lineno,
          colno,
          pos,
        );
      }
    }
  }

  _parseString(delimiter: '"' | "'"): string {
    this.forward();

    let str = "";

    while (!this.isFinished() && this.current() !== delimiter) {
      const cur = this.current();

      if (cur === "\\") {
        this.forward();
        switch (this.current()) {
          case "n":
            str += "\n";
            break;
          case "t":
            str += "\t";
            break;
          case "r":
            str += "\r";
            break;
          default:
            str += this.current();
        }
        this.forward();
      } else {
        str += cur;
        this.forward();
      }
    }

    this.forward();
    return str;
  }

  _matches(str: string): boolean {
    if (this.index + str.length > this.len) {
      return false;
    }

    const m = this.str.slice(this.index, this.index + str.length);
    return m === str;
  }

  _extractString(str: string): string {
    if (this._matches(str)) {
      this.forwardN(str.length);
      return str;
    }
    return "";
  }

  _extractUntil(charString?: string): string {
    // Extract all non-matching chars, with the default matching set
    // to everything
    return this._extractMatching(true, charString || "");
  }

  _extract(charString: string): string {
    // Extract all matching chars (no default, so charString must be
    // explicit)
    return this._extractMatching(false, charString);
  }

  _extractMatching(breakOnMatch: boolean, charString: string): string {
    // Pull out characters until a breaking char is hit.
    // If breakOnMatch is false, a non-matching char stops it.
    // If breakOnMatch is true, a matching char stops it.

    if (this.isFinished()) {
      return "";
    }

    const first = charString.indexOf(this.current());

    // Only proceed if the first character doesn't meet our condition
    if ((breakOnMatch && first === -1) || (!breakOnMatch && first !== -1)) {
      let t = this.current();
      this.forward();

      // And pull out all the chars one at a time until we hit a
      // breaking char
      let idx = charString.indexOf(this.current());

      while (
        ((breakOnMatch && idx === -1) || (!breakOnMatch && idx !== -1)) &&
        !this.isFinished()
      ) {
        t += this.current();
        this.forward();

        idx = charString.indexOf(this.current());
      }

      return t;
    }

    return "";
  }

  // _extractRegex(regex) {
  //   const matches = this.currentStr().match(regex);
  //   if (!matches) {
  //     return null;
  //   }
  //
  //   // Move forward whatever was matched
  //   this.forwardN(matches[0].length);
  //
  //   return matches;
  // }

  isFinished(): boolean {
    return this.index >= this.len;
  }

  forwardN(n: number): void {
    for (let i = 0; i < n; i++) {
      this.forward();
    }
  }

  forward(): void {
    this.index++;

    if (this.previous() === "\n") {
      this.lineno++;
      this.colno = 0;
    } else {
      this.colno++;
    }
  }

  backN(n: number): void {
    for (let i = 0; i < n; i++) {
      this.back();
    }
  }

  back(): void {
    this.index--;

    if (this.current() === "\n") {
      this.lineno--;

      const idx = this.str.lastIndexOf("\n", this.index - 1);
      if (idx === -1) {
        this.colno = this.index;
      } else {
        this.colno = this.index - idx;
      }
    } else {
      this.colno--;
    }
  }

  // current returns current character
  current(): string {
    if (!this.isFinished()) {
      return this.str.charAt(this.index);
    }
    return "";
  }

  // currentStr returns what's left of the unparsed string
  currentStr(): string {
    if (!this.isFinished()) {
      return this.str.substr(this.index);
    }
    return "";
  }

  previous(): string {
    return this.str.charAt(this.index - 1);
  }
}

export function lex(src: string, opts?: TokenizerOptions): Tokenizer {
  return new Tokenizer(src, opts);
}
