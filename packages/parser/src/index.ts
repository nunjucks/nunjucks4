import { types as t, builders as b, canAssign } from "@nunjucks/ast";
import * as lexer from "./lexer";
import { TemplateSyntaxError } from "./lexer";
import type { Token } from "./lexer";
import { TemplateError } from "@nunjucks/utils";
import type { TemplateErrorType } from "@nunjucks/utils";

export interface Extension {
  tags: string[];
  parse(
    self: Parser,
    types: typeof t,
    builders: typeof b,
    lexer: any
  ): t.Node | t.Node[];
}

const assertName: (typeof t.Name)["assert"] = t.Name.assert.bind(t.Name);

const compareOperatorsList = ["eq", "ne", "lt", "lteq", "gt", "gteq"] as const;

type CompareOperator = (typeof compareOperatorsList)[number];

const compareOperators: Set<CompareOperator> = new Set(compareOperatorsList);

function isCompareOperator(val: string): val is CompareOperator {
  return (compareOperators as Set<string>).has(val);
}

type MathBuilders =
  | typeof b.add
  | typeof b.sub
  | typeof b.mul
  | typeof b.div
  | typeof b.floorDiv
  | typeof b.mod;

const mathNodes: Readonly<Record<string, MathBuilders>> = Object.freeze({
  add: b.add,
  sub: b.sub,
  mul: b.mul,
  div: b.div,
  floordiv: b.floorDiv,
  mod: b.mod,
});

function assertNameOrTuple(val: unknown): asserts val is t.Tuple | t.Name {
  if (!t.Tuple.check(val) && !t.Name.check(val)) {
    throw new Error("Expected tuple or name");
  }
}

type StatementKeyword =
  | "for"
  | "if"
  | "block"
  | "extends"
  | "print"
  | "macro"
  | "include"
  | "from"
  | "import"
  | "set"
  | "with"
  | "autoescape";

export class Parser {
  stream: lexer.Tokenizer;
  peeked: lexer.Token | null;
  current: lexer.Token;
  breakOnBlocks: string[] | null;
  dropLeadingWhitespace: boolean;
  extensions: Extension[];
  _endTokenStack: Array<string[]>;
  _tagStack: string[];

  _statementMethodMap: Record<
    StatementKeyword,
    (this: Parser) => t.Node | t.Node[]
  >;

  constructor(stream: lexer.Tokenizer) {
    this.stream = stream;
    this.peeked = null;
    this.current = stream.currentToken;
    this.breakOnBlocks = null;
    this.dropLeadingWhitespace = false;
    this._endTokenStack = [];
    this._tagStack = [];
    this.extensions = [];
    this._statementMethodMap = {
      for: this.parseFor.bind(this),
      if: this.parseIf.bind(this),
      block: this.parseBlock.bind(this),
      extends: this.parseExtends.bind(this),
      print: this.parsePrint.bind(this),
      macro: this.parseMacro.bind(this),
      include: this.parseInclude.bind(this),
      from: this.parseFrom.bind(this),
      import: this.parseImport.bind(this),
      set: this.parseSet.bind(this),
      with: this.parseWith.bind(this),
      autoescape: this.parseAutoescape.bind(this),
    };
  }

  nextToken(withWhitespace?: boolean): lexer.Token {
    let tok;

    if (this.peeked) {
      if (!withWhitespace && this.peeked.type === lexer.TOKEN_WHITESPACE) {
        this.peeked = null;
      } else {
        tok = this.peeked;
        this.peeked = null;
        this.current = tok;
        return tok;
      }
    }

    tok = this.stream.nextToken();

    if (!withWhitespace) {
      while (tok && tok.type === lexer.TOKEN_WHITESPACE) {
        tok = this.stream.nextToken();
      }
    }

    this.current = tok;

    return tok;
  }

  peekToken(): lexer.Token {
    const peeked = this.peeked || this.nextToken();
    this.peeked = peeked;
    return peeked;
  }

  pushToken(tok: lexer.Token): void {
    if (this.peeked) {
      throw new Error("pushToken: can only push one token on between reads");
    }
    this.peeked = tok;
  }

  error(msg: string, lineno?: number, colno?: number): TemplateSyntaxError {
    if (lineno === undefined || colno === undefined) {
      const tok = this.peekToken() || {};
      lineno = tok.lineno;
      colno = tok.colno;
    }
    return new TemplateSyntaxError(msg, { lineno });
  }

  fail(msg: string, lineno?: number, colno?: number): never {
    throw this.error(msg, lineno, colno);
  }

  test(token: Token, rule: string): boolean {
    const [type, value] = rule.split(":");
    return (
      token.type === type &&
      (typeof value === "undefined" || token.value === value)
    );
  }

  testAny(token: Token, rules: string[]): boolean {
    return rules.some((r) => this.test(token, r));
  }

  skip(rule: string): boolean {
    const token = this.nextToken();
    if (!this.test(token, rule)) {
      this.pushToken(token);
      return false;
    }
    return true;
  }

  skipAny(rules: string[]): boolean {
    const token = this.nextToken();
    if (rules.every((r) => !this.test(token, r))) {
      this.pushToken(token);
      return false;
    }
    return true;
  }

  expect(rule: string): lexer.Token {
    const tok = this.nextToken();
    if (!tok) {
      this.fail("expected '" + rule + "', got end of stream");
    } else {
      const [tokenType, tokenValue] = rule.split(":");
      if (tok.type !== tokenType) {
        this.fail(
          `expected '${tokenType}', got '${tok.type}'`,
          tok.lineno,
          tok.colno
        );
      } else if (typeof tokenValue !== "undefined") {
        if (tok.value !== tokenValue) {
          this.fail(
            `expected '${tokenType}' to have value '${tokenValue}', got '${tok.value}'`,
            tok.lineno,
            tok.colno
          );
        }
      }
    }
    return tok;
  }

  skipValue(type: lexer.Token["type"], val: string): boolean {
    const tok = this.nextToken();
    if (!tok || tok.type !== type || tok.value !== val) {
      this.pushToken(tok);
      return false;
    }
    return true;
  }

  skipName(val: string): boolean {
    return this.skipValue(lexer.TOKEN_NAME, val);
  }

  tokToLoc(token: Token, endToken?: Token): t.SourceLocation {
    const source = endToken
      ? this.stream.str.substr(
          token.pos,
          endToken.pos + endToken.value.length - token.pos
        )
      : token.value;
    let endLine = token.lineno;
    let endColumn = token.colno;
    for (const c of source) {
      if (c === "\n") {
        endLine++;
        endColumn = 0;
      } else {
        endColumn++;
      }
    }
    return {
      start: {
        line: token.lineno,
        column: token.colno,
      },
      end: {
        line: endLine,
        column: endColumn,
      },
      source,
    };
  }

  parseAssignTarget({
    withTuple,
    nameOnly,
    extraEndRules,
    withNamespace,
  }: {
    withTuple?: boolean;
    nameOnly: true;
    extraEndRules?: string[];
    withNamespace?: boolean;
  }): t.Name;

  parseAssignTarget({
    withTuple,
    nameOnly,
    extraEndRules,
    withNamespace,
  }: {
    withTuple?: boolean;
    nameOnly?: boolean;
    extraEndRules?: string[];
    withNamespace?: boolean;
  }): t.Name | t.Tuple | t.NSRef;

  parseAssignTarget({
    withTuple,
    nameOnly,
    extraEndRules,
    withNamespace,
  }: {
    withTuple?: boolean;
    nameOnly?: boolean;
    extraEndRules?: string[];
    withNamespace?: false;
  }): t.Name | t.Tuple;

  parseAssignTarget({
    withTuple = true,
    nameOnly = false,
    extraEndRules,
    withNamespace = false,
  }: {
    withTuple?: boolean;
    nameOnly?: boolean;
    extraEndRules?: string[];
    withNamespace?: boolean;
  } = {}): t.Name | t.Tuple | t.NSRef {
    let target: t.Expr;
    this.peekToken();
    const looked = this.stream.peekToken();
    if (withNamespace && looked.type === lexer.TOKEN_DOT) {
      const token = this.expect("name");
      this.skip("dot");
      const attr = this.expect("name");
      target = b.nsRef.from({
        name: token.value,
        attr: attr.value,
        loc: this.tokToLoc(token, attr),
      });
    } else if (nameOnly) {
      const token = this.expect(lexer.TOKEN_NAME);
      target = b.name.from({
        name: token.value,
        ctx: "store",
        loc: this.tokToLoc(token),
      });
    } else {
      if (withTuple) {
        target = this.parseTuple({ simplified: true, extraEndRules });
        assertNameOrTuple(target);
      } else {
        target = this.parsePrimary();
        assertName(target);
      }
      target.ctx = "store";
    }
    if (!canAssign(target)) {
      this.fail(`Can't assign to ${target.type}`);
    }
    return target as t.Name | t.Tuple | t.NSRef;
  }

  parseExpression({
    withCondExpr = true,
  }: { withCondExpr?: boolean } = {}): t.Expr {
    if (withCondExpr) {
      return this.parseCondExpr();
    }
    return this.parseOr();
  }

  parseCondExpr(): t.Expr {
    const startTok = this.peekToken();
    let expr1: t.Expr = this.parseOr();
    let expr2: t.Expr | null;
    let test: t.Expr;
    while (this.skip("name:if")) {
      test = this.parseOr();
      if (this.skip("name:else")) {
        expr2 = this.parseCondExpr();
      } else {
        expr2 = null;
      }
      expr1 = b.condExpr.from({
        test,
        expr1,
        expr2,
        loc: this.tokToLoc(startTok, this.current),
      });
    }
    return expr1;
  }

  parseOr(): t.Expr {
    const startTok = this.peekToken();
    let left: t.Expr = this.parseAnd();
    while (this.skip("name:or")) {
      const right = this.parseAnd();
      left = b.or.from({
        left,
        right,
        loc: this.tokToLoc(startTok, this.current),
      });
    }
    return left;
  }

  parseAnd(): t.Expr {
    const startTok = this.peekToken();
    let left: t.Expr = this.parseNot();
    while (this.skip("name:and")) {
      const right = this.parseNot();
      left = b.and.from({
        left,
        right,
        loc: this.tokToLoc(startTok, this.current),
      });
    }
    return left;
  }

  parseNot(): t.Expr {
    const startTok = this.peekToken();
    if (this.skip("name:not")) {
      return b.not.from({
        node: this.parseNot(),
        loc: this.tokToLoc(startTok, this.current),
      });
    }
    return this.parseCompare();
  }

  parseCompare(): t.Expr {
    const startTok = this.peekToken();
    const expr = this.parseMath1();
    const ops: t.Operand[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const tokenType = this.peekToken().type;
      if (isCompareOperator(tokenType)) {
        this.nextToken();
        ops.push(
          b.operand.from({
            op: tokenType,
            expr: this.parseMath1(),
          })
        );
      } else if (this.skip("name:in")) {
        ops.push(
          b.operand.from({
            op: "in",
            expr: this.parseMath1(),
          })
        );
      } else if (
        this.test(this.stream.currentToken, "name:not") &&
        this.test(this.stream.peekToken(), "name:in")
      ) {
        this.skip("name:not");
        this.skip("name:in");
        ops.push(
          b.operand.from({
            op: "notin",
            expr: this.parseMath1(),
          })
        );
      } else {
        break;
      }
    }
    if (!ops.length) {
      return expr;
    }
    return b.compare.from({
      ops,
      expr,
      loc: this.tokToLoc(startTok, this.current),
    });
  }

  parseMath1(): t.Expr {
    const startTok = this.peekToken();
    let left: t.Expr = this.parseConcat();
    let currType: string = this.peekToken().type;
    while (currType === "add" || currType === "sub") {
      const builder = mathNodes[currType];
      this.nextToken();
      const right = this.parseConcat();
      left = builder.from({
        left,
        right,
        loc: this.tokToLoc(startTok, this.current),
      });
      currType = this.peekToken().type;
    }
    return left;
  }

  parseConcat(): t.Expr {
    const startTok = this.peekToken();
    const nodes: t.Expr[] = [this.parseMath2()];
    while (this.skip(lexer.TOKEN_TILDE)) {
      nodes.push(this.parseMath2());
    }
    if (nodes.length === 1) {
      return nodes[0];
    }
    return b.concat.from({
      nodes,
      loc: this.tokToLoc(startTok, this.current),
    });
  }

  parseMath2(): t.Expr {
    const startTok = this.peekToken();
    let left: t.Expr = this.parsePow();
    let currType: string = this.peekToken().type;
    while (
      currType === "mul" ||
      currType === "div" ||
      currType === "floordiv" ||
      currType === "mod"
    ) {
      const builder = mathNodes[currType];
      this.nextToken();
      const right = this.parsePow();
      left = builder.from({
        left,
        right,
        loc: this.tokToLoc(startTok, this.current),
      });
      currType = this.peekToken().type;
    }
    return left;
  }

  parsePow(): t.Expr {
    const startTok = this.peekToken();
    let left: t.Expr = this.parseUnary();
    while (this.skip("pow")) {
      const right = this.parseUnary();
      left = b.pow.from({
        left,
        right,
        loc: this.tokToLoc(startTok, this.current),
      });
    }
    return left;
  }

  parseUnary({ withFilter = true }: { withFilter?: boolean } = {}): t.Expr {
    const startTok = this.peekToken();
    let node: t.Expr;

    if (this.skip("sub")) {
      node = b.neg.from({
        node: this.parseUnary({ withFilter: false }),
        loc: this.tokToLoc(startTok, this.current),
      });
    } else if (this.skip("add")) {
      node = b.pos.from({
        node: this.parseUnary({ withFilter: false }),
        loc: this.tokToLoc(startTok, this.current),
      });
    } else {
      node = this.parsePrimary();
    }
    node = this.parsePostfix(node);
    if (withFilter) {
      node = this.parseFilterExpr(node);
    }
    return node;
  }

  parsePrimary(): t.Expr {
    const token = this.peekToken();
    const loc = this.tokToLoc(token);
    if (this.skip("name")) {
      if (["true", "false", "True", "False"].indexOf(token.value) !== -1) {
        return b.const.from({
          value: token.value === "true" || token.value === "True",
          loc,
        });
      } else if (
        token.value === "none" ||
        token.value === "None" ||
        token.value === "null"
      ) {
        return b.const.from({ value: null, loc });
      } else {
        return b.name.from({ name: token.value, ctx: "load", loc });
      }
    } else if (this.skip("string")) {
      const buf: string[] = [this.current.value];
      while (this.skip("string")) {
        buf.push(this.current.value);
      }
      return b.const.from({
        value: buf.join(""),
        loc: this.tokToLoc(token, this.current),
      });
    } else if (this.skipAny(["int", "float"])) {
      return b.const.from({
        value: Number(token.value.replace(/_/g, "")),
        loc,
      });
    } else if (this.skip(lexer.TOKEN_LPAREN)) {
      const node = this.parseTuple({ explicitParentheses: true });
      this.expect(lexer.TOKEN_RPAREN);
      return node;
    } else if (this.skip(lexer.TOKEN_LBRACKET)) {
      return this.parseList();
    } else if (this.skip(lexer.TOKEN_LBRACE)) {
      return this.parseDict();
    } else {
      const { lineno, colno } = token;
      this.fail(`Unexpected ${token.type}`, lineno, colno);
    }
  }

  parseTuple({
    simplified = false,
    withCondExpr = true,
    extraEndRules,
    explicitParentheses = false,
  }: {
    simplified?: boolean;
    withCondExpr?: boolean;
    extraEndRules?: string[];
    explicitParentheses?: boolean;
  } = {}): t.Expr {
    const startTok = this.peekToken();
    let parse: () => t.Expr;
    if (simplified) {
      parse = () => this.parsePrimary();
    } else if (withCondExpr) {
      parse = () => this.parseExpression();
    } else {
      parse = () => this.parseExpression({ withCondExpr: false });
    }

    let isTuple = false;
    const args: t.Expr[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (args.length) {
        this.expect("comma");
      }
      if (this.isTupleEnd(extraEndRules)) {
        break;
      }
      args.push(parse());
      if (this.peekToken().type === "comma") {
        isTuple = true;
      } else {
        break;
      }
    }
    if (!isTuple) {
      if (args.length) {
        return args[0];
      }
      // if we don't have explicit parentheses, an empty tuple is
      // not a valid expression.  This would mean nothing (literally
      // nothing) in the spot of an expression would be an empty
      // tuple.
      if (!explicitParentheses) {
        this.fail("Expected an expression");
      }
    }
    return b.tuple.from({
      items: args,
      ctx: "load",
      loc: this.tokToLoc(startTok, this.current),
    });
  }

  parseList(): t.List {
    const token = this.current;
    const items: t.Expr[] = [];
    while (this.peekToken().type !== lexer.TOKEN_RBRACKET) {
      if (items.length) {
        this.expect(lexer.TOKEN_COMMA);
      }
      if (this.peekToken().type === lexer.TOKEN_RBRACKET) {
        break;
      }
      items.push(this.parseExpression());
    }
    this.expect(lexer.TOKEN_RBRACKET);
    return b.list.from({
      items,
      loc: this.tokToLoc(token, this.current),
    });
  }

  parseDict(): t.Dict {
    const token = this.current;
    const items: t.Pair[] = [];
    while (this.peekToken().type !== lexer.TOKEN_RBRACE) {
      if (items.length) {
        this.expect(lexer.TOKEN_COMMA);
      }
      if (this.peekToken().type === lexer.TOKEN_RBRACE) {
        break;
      }
      const key = this.parseExpression();
      this.expect(lexer.TOKEN_COLON);
      const value = this.parseExpression();
      items.push(
        b.pair.from({
          key,
          value,
          loc: this.tokToLoc(token, this.current),
        })
      );
    }
    this.expect(lexer.TOKEN_RBRACE);
    return b.dict.from({
      items,
      loc: this.tokToLoc(token, this.current),
    });
  }

  parsePostfix(node: t.Expr): t.Expr {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const tokenType = this.peekToken().type;
      if (tokenType === "dot" || tokenType === "lbracket") {
        node = this.parseSubscript(node);
      } else if (tokenType === lexer.TOKEN_LPAREN) {
        node = this.parseCall(node);
      } else {
        break;
      }
    }
    return node;
  }

  parseFilterExpr(node: t.Expr): t.Expr {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const peek = this.peekToken();
      if (peek.type === lexer.TOKEN_PIPE) {
        node = this.parseFilter(node);
      } else if (peek.type === lexer.TOKEN_NAME && peek.value === "is") {
        node = this.parseTest(node);
      } else if (peek.type === lexer.TOKEN_LPAREN) {
        // calls are valid both after postfix expressions (getattr
        // and getitem) as well as filters and tests
        node = this.parseCall(node);
      } else {
        break;
      }
    }
    return node;
  }

  parseSubscript(node: t.Expr): t.Getattr | t.Getitem {
    const token = this.nextToken();
    if (token.type === lexer.TOKEN_DOT) {
      const attrToken = this.nextToken();
      if (attrToken.type === lexer.TOKEN_NAME) {
        return b.getattr.from({
          node,
          attr: attrToken.value,
          ctx: "load",
          loc: this.tokToLoc(token, this.current),
        });
      } else if (attrToken.type !== lexer.TOKEN_INT) {
        const { lineno, colno } = attrToken;
        this.fail("Expected name or number", lineno, colno);
      }
      const arg = b.const.from({
        value: attrToken.value,
        loc: this.tokToLoc(attrToken),
      });
      return b.getitem.from({
        node,
        arg,
        ctx: "load",
        loc: this.tokToLoc(token, this.current),
      });
    } else if (token.type === lexer.TOKEN_LBRACKET) {
      const args: t.Expr[] = [];
      while (this.peekToken().type !== lexer.TOKEN_RBRACKET) {
        if (args.length) {
          this.expect(lexer.TOKEN_COMMA);
        }
        args.push(this.parseSubscribed());
      }
      this.expect(lexer.TOKEN_RBRACKET);
      const arg =
        args.length === 1
          ? args[0]
          : b.tuple.from({
              items: args,
              ctx: "load",
              loc: this.tokToLoc(token, this.current),
            });
      return b.getitem.from({
        node,
        arg,
        ctx: "load",
        loc: this.tokToLoc(token, this.current),
      });
    }
    const { lineno, colno } = token;
    this.fail("expected subscript expression", lineno, colno);
  }

  parseSubscribed(): t.Expr {
    const token = this.peekToken();

    let start: t.Expr | null = null;
    let stop: t.Expr | null = null;
    let step: t.Expr | null = null;

    if (this.skip(lexer.TOKEN_COLON)) {
      start = null;
    } else {
      const node = this.parseExpression();
      if (!this.skip(lexer.TOKEN_COLON)) {
        return node;
      }
      start = node;
    }

    const { type: peekType } = this.peekToken();
    if (peekType === lexer.TOKEN_COLON) {
      stop = null;
    } else if (
      peekType !== lexer.TOKEN_RBRACKET &&
      peekType !== lexer.TOKEN_COMMA
    ) {
      stop = this.parseExpression();
    } else {
      stop = null;
    }

    if (this.skip(lexer.TOKEN_COLON)) {
      const { type: peekType } = this.peekToken();
      if (peekType !== lexer.TOKEN_RBRACKET && peekType !== lexer.TOKEN_COMMA) {
        step = this.parseExpression();
      } else {
        step = null;
      }
    } else {
      step = null;
    }

    return b.slice.from({
      start,
      stop,
      step,
      loc: this.tokToLoc(token, this.current),
    });
  }

  parseCallArgs(): {
    args: t.Expr[];
    kwargs: t.Keyword[];
    dynArgs: t.Expr | null;
    dynKwargs: t.Expr | null;
  } {
    const token = this.expect(lexer.TOKEN_LPAREN);
    const args: t.Expr[] = [];
    const kwargs: t.Keyword[] = [];
    let dynArgs: t.Expr | null = null;
    let dynKwargs: t.Expr | null = null;

    let requireComma = false;

    const ensure: (cond: any) => asserts cond = (condition) => {
      if (!condition) {
        const { lineno, colno } = token;
        this.fail("Invalid syntax for function call expression", lineno, colno);
      }
    };

    while (this.peekToken().type !== lexer.TOKEN_RPAREN) {
      if (requireComma) {
        this.expect(lexer.TOKEN_COMMA);
        if (this.peekToken().type === lexer.TOKEN_RPAREN) {
          break;
        }
      }
      if (this.skip(lexer.TOKEN_MUL)) {
        ensure(dynArgs === null && dynKwargs === null);
        dynArgs = this.parseExpression();
      } else if (this.skip(lexer.TOKEN_POW)) {
        ensure(dynKwargs === null);
        dynKwargs = this.parseExpression();
      } else {
        const argToken = this.peekToken();
        if (
          argToken.type === lexer.TOKEN_NAME &&
          this.stream.peekToken().type === lexer.TOKEN_ASSIGN
        ) {
          // Parsing a kwarg
          ensure(dynKwargs === null);
          const key = this.nextToken().value;
          this.expect(lexer.TOKEN_ASSIGN);
          const value = this.parseExpression();
          kwargs.push(
            b.keyword.from({
              key,
              value,
              loc: this.tokToLoc(argToken, this.current),
            })
          );
        } else {
          // Parsing an arg
          ensure(dynArgs === null && dynKwargs === null && !kwargs.length);
          args.push(this.parseExpression());
        }
      }
      requireComma = true;
    }
    this.expect(lexer.TOKEN_RPAREN);
    return { args, kwargs, dynArgs, dynKwargs };
  }

  parseCall(node: t.Expr): t.Call {
    const token = this.peekToken();
    const { args, kwargs, dynArgs, dynKwargs } = this.parseCallArgs();
    return b.call.from({
      node,
      args,
      kwargs,
      dynArgs,
      dynKwargs,
      loc: this.tokToLoc(token, this.current),
    });
  }

  parseFilter<T extends t.Expr | null>(
    node: T,
    { startInline = false }: { startInline?: boolean } = {}
  ): T {
    while (this.peekToken().type === lexer.TOKEN_PIPE || startInline) {
      if (!startInline) {
        this.nextToken();
      }
      const token = this.expect(lexer.TOKEN_NAME);
      let name = token.value;
      while (this.skip(lexer.TOKEN_DOT)) {
        name += `.${this.expect(lexer.TOKEN_NAME).value}`;
      }
      let args: t.Expr[] = [];
      let kwargs: t.Keyword[] = [];
      let dynArgs: t.Expr | null = null;
      let dynKwargs: t.Expr | null = null;

      if (this.peekToken().type === lexer.TOKEN_LPAREN) {
        const callArgs = this.parseCallArgs();
        args = callArgs.args;
        kwargs = callArgs.kwargs.map((k) => b.keyword(k.key, k.value));
        dynArgs = callArgs.dynArgs;
        dynKwargs = callArgs.dynKwargs;
      }
      node = b.filter.from({
        node,
        name,
        args,
        kwargs,
        dynArgs,
        dynKwargs,
        loc: this.tokToLoc(token, this.current),
      }) as T;
      startInline = false;
    }
    return node;
  }

  parseTest(node: t.Expr): t.Expr {
    const argTypes = new Set<string>([
      "name",
      "string",
      "int",
      "float",
      "lparen",
      "lbracket",
      "lbrace",
    ]);
    const logicalOpRules = ["name:else", "name:or", "name:and"];
    const token = this.nextToken();
    const negated = this.skip("name:not");
    const nameParts = [this.expect("name").value];
    while (this.skip("dot")) {
      nameParts.push(this.expect("name").value);
    }
    const name = nameParts.join(".");
    let args: t.Expr[] = [];
    let kwargs: t.Keyword[] = [];
    let dynArgs: t.Expr | null = null;
    let dynKwargs: t.Expr | null = null;
    const peek = this.peekToken();
    if (peek.type === lexer.TOKEN_LPAREN) {
      const callArgs = this.parseCallArgs();
      args = callArgs.args;
      kwargs = callArgs.kwargs.map((t) => b.keyword(t.key, t.value));
      dynArgs = callArgs.dynArgs;
      dynKwargs = callArgs.dynKwargs;
    } else if (
      argTypes.has(peek.type) &&
      logicalOpRules.every((r) => !this.test(peek, r))
    ) {
      if (this.test(peek, "name:is")) {
        this.fail("You cannot chain multiple tests with is");
      }
      let argNode = this.parsePrimary();
      argNode = this.parsePostfix(argNode);
      args.push(argNode);
    }
    node = b.test.from({
      node,
      name,
      args,
      kwargs,
      dynArgs,
      dynKwargs,
      loc: this.tokToLoc(token, this.current),
    });
    if (negated) {
      node = b.not.from({
        node,
        loc: this.tokToLoc(token, this.current),
      });
    }
    return node;
  }

  parseStatements(
    endTokens: string[],
    { dropNeedle = false }: { dropNeedle?: boolean } = {}
  ): t.Node[] {
    this.skip(lexer.TOKEN_COLON);
    this.expect(lexer.TOKEN_BLOCK_END);
    const result = this.subparse(endTokens);
    if (this.current.type === lexer.TOKEN_EOF) {
      this.fail("Unexpected end of template");
    }
    if (dropNeedle) {
      this.nextToken();
    }
    return result;
  }

  parseFor(): t.Loop {
    const forTok = this.peekToken();
    let nodeBuilder: keyof typeof b;
    let endBlock: string;

    if (this.skipName("for")) {
      nodeBuilder = "for";
      // node = new nodes.For(forTok.lineno, forTok.colno);
      endBlock = "endfor";
    } else if (this.skipName("asyncEach")) {
      nodeBuilder = "asyncEach";
      // node = new nodes.AsyncEach(forTok.lineno, forTok.colno);
      endBlock = "endeach";
    } else if (this.skipName("asyncAll")) {
      // node = new nodes.AsyncAll(forTok.lineno, forTok.colno);
      nodeBuilder = "asyncAll";
      endBlock = "endall";
    } else {
      this.fail("parseFor: expected for{Async}", forTok.lineno, forTok.colno);
    }

    const target = this.parseAssignTarget({ extraEndRules: ["name:in"] });
    this.expect("name:in");
    const iter = this.parseTuple({
      withCondExpr: false,
      extraEndRules: ["name:recursive"],
    });
    let test = null;
    if (this.skip("name:if")) {
      test = this.parseExpression();
    }
    const recursive = this.skip("name:recursive");
    const body = this.parseStatements([`name:${endBlock}`, "name:else"]);
    let else_: t.Node[] = [];
    if (this.nextToken()?.value !== endBlock) {
      else_ = this.parseStatements([`name:${endBlock}`], { dropNeedle: true });
    }
    return b[nodeBuilder].from({
      target,
      iter,
      body,
      else_,
      test,
      recursive,
      loc: this.tokToLoc(forTok, this.current),
    });
  }

  parseWith(): t.With {
    const startTok = this.expect("name:with");
    const targets: t.Expr[] = [];
    const values: t.Expr[] = [];
    while (this.current.type !== lexer.TOKEN_BLOCK_END) {
      if (targets.length) {
        this.expect(lexer.TOKEN_COMMA);
      }
      const target = this.parseAssignTarget({});
      if (t.NSRef.check(target)) {
        // TODO: fix this type inference
        this.fail("Unexpected NSRef");
      }
      target.ctx = "param";
      targets.push(target);
      this.expect(lexer.TOKEN_ASSIGN);
      values.push(this.parseExpression());
    }
    const body = this.parseStatements(["name:endwith"], { dropNeedle: true });
    return b.with.from({
      targets,
      values,
      body,
      loc: this.tokToLoc(startTok, this.current),
    });
  }

  parseAutoescape(): t.Scope {
    const startTok = this.nextToken();
    const peek = this.peekToken();
    const options: t.Keyword[] = [
      b.keyword.from({
        key: "autoescape",
        value: this.parseExpression(),
        loc: this.tokToLoc(peek, this.current),
      }),
    ];
    const body = this.parseStatements(["name:endautoescape"], {
      dropNeedle: true,
    });
    const node = b.scopedEvalContextModifier.from({
      options,
      body,
      loc: this.tokToLoc(startTok, this.current),
    });
    return b.scope.from({
      body: [node],
      loc: this.tokToLoc(startTok, this.current),
    });
  }

  parseBlock(): t.Block {
    const token = this.nextToken();
    const name = this.expect("name").value;
    const scoped = this.skip("name:scoped");
    const required = this.skip("name:required");

    if (this.skip("sub")) {
      this.fail(
        "Block names may not contain hyphens, use an underscore instead."
      );
    }

    const body = this.parseStatements(["name:endblock"], { dropNeedle: true });

    if (required) {
      if (
        !body.every(
          (b) =>
            t.Output.check(b) &&
            b.nodes.every((c) => t.TemplateData.check(c) && !c.data.match(/\S/))
        )
      ) {
        this.fail("Required blocks can only contain comments or whitespace");
      }
    }
    this.skip(`name:${name}`);
    return b.block.from({
      name,
      scoped,
      required,
      body,
      loc: this.tokToLoc(token, this.current),
    });
  }

  parseExtends(): t.Extends {
    const token = this.nextToken();
    const template = this.parseExpression();
    return b.extends.from({
      template,
      loc: this.tokToLoc(token, this.current),
    });
  }

  parseImportContext(default_: boolean): boolean {
    const peek = this.peekToken();
    let withContext = default_;

    if (
      this.testAny(peek, ["name:with", "name:without"]) &&
      this.test(this.stream.peekToken(), "name:context")
    ) {
      withContext = this.nextToken().value === "with";
      this.expect("name:context");
    }

    return withContext;
  }

  parseInclude(): t.Include {
    const token = this.nextToken();
    const template = this.parseExpression();
    const peek = this.peekToken();
    // const look = this.stream.peekToken();
    let ignoreMissing = false;
    if (
      this.test(peek, "name:ignore") &&
      this.test(this.stream.peekToken(), "name:missing")
    ) {
      ignoreMissing = true;
      this.expect("name:ignore");
      this.expect("name:missing");
    }

    return b.include.from({
      template,
      ignoreMissing,
      withContext: this.parseImportContext(true),
      loc: this.tokToLoc(token, this.current),
    });
  }

  parseImport(): t.Import {
    const token = this.nextToken();
    const template = this.parseExpression();
    this.expect("name:as");
    const target = this.parseAssignTarget({ nameOnly: true }).name;
    return b.import.from({
      template,
      target,
      withContext: this.parseImportContext(false),
      loc: this.tokToLoc(token, this.current),
    });
  }

  parseFrom(): t.FromImport {
    const token = this.nextToken();
    const template = this.parseExpression();
    this.expect("name:import");
    const names: (string | string[])[] = [];
    let withContext = false;

    const parseContext: () => boolean = () => {
      const peek = this.peekToken();
      if (this.testAny(peek, ["name:with", "name:without"])) {
        if (this.test(this.stream.peekToken(), "name:context")) {
          withContext = this.nextToken().value === "with";
          this.expect("name:context");
          return true;
        }
      }

      return false;
    };

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (names.length) {
        this.expect("comma");
      }
      if (this.peekToken().type === "name") {
        if (parseContext()) {
          break;
        }
        const targetTok = this.peekToken();
        const target = this.parseAssignTarget({ nameOnly: true });
        if (target.name[0] === "_") {
          const { lineno, colno } = targetTok;
          this.fail(
            "names starting with an underline can not be imported",
            lineno,
            colno
          );
        }
        if (this.skip("name:as")) {
          const alias = this.parseAssignTarget({ nameOnly: true });
          names.push([target.name, alias.name]);
        } else {
          names.push(target.name);
        }
        if (parseContext() || this.peekToken().type !== "comma") {
          break;
        }
      } else {
        this.expect("name");
      }
    }
    return b.fromImport.from({
      template,
      names,
      withContext,
      loc: this.tokToLoc(token, this.current),
    });
  }

  parseSignature(): { args: t.Name[]; defaults: t.Expr[] } {
    const args: t.Name[] = [];
    const defaults: t.Expr[] = [];
    this.expect("lparen");
    while (!this.skip("rparen")) {
      if (args.length) {
        this.expect("comma");
      }
      const arg = this.parseAssignTarget({ nameOnly: true });
      assertName(arg);
      arg.ctx = "param";
      if (this.skip("assign")) {
        defaults.push(this.parseExpression());
      } else if (defaults.length) {
        this.fail("non-default argument follows default argument");
      }
      args.push(arg);
    }
    return { args, defaults };
  }

  parseCallBlock(): t.CallBlock {
    const token = this.nextToken();
    let args: t.Name[] = [];
    let defaults: t.Expr[] = [];
    if (this.peekToken().type === "lparen") {
      const signature = this.parseSignature();
      args = signature.args;
      defaults = signature.defaults;
    }
    const callTok = this.peekToken();
    const call = this.parseExpression();
    if (!t.Call.check(call)) {
      const { lineno, colno } = callTok;
      this.fail("Expected call", lineno, colno);
    }
    const body = this.parseStatements(["name:endcall"], { dropNeedle: true });
    return b.callBlock.from({
      args,
      defaults,
      call,
      body,
      loc: this.tokToLoc(token, this.current),
    });
  }

  parseFilterBlock(): t.FilterBlock {
    const token = this.nextToken();
    const filter = this.parseFilter(null, { startInline: true });
    t.Filter.assert(filter);
    const body = this.parseStatements(["name:endfilter"], { dropNeedle: true });
    return b.filterBlock.from({
      filter,
      body,
      loc: this.tokToLoc(token, this.current),
    });
  }

  parseMacro(): t.Macro {
    const token = this.nextToken();
    const name = this.parseAssignTarget({ nameOnly: true }).name;
    const { args, defaults } = this.parseSignature();
    const body = this.parseStatements(["name:endmacro"], { dropNeedle: true });
    return b.macro.from({
      name,
      args,
      defaults,
      body,
      loc: this.tokToLoc(token, this.current),
    });
  }

  parsePrint(): t.Output {
    const token = this.nextToken();
    const nodes: t.Expr[] = [];
    while (this.peekToken().type !== lexer.TOKEN_BLOCK_END) {
      if (nodes.length) {
        this.expect("comma");
      }
      nodes.push(this.parseExpression());
    }
    return b.output.from({
      nodes,
      loc: this.tokToLoc(token, this.current),
    });
  }

  isTupleEnd(extraEndRules?: string[]): boolean {
    const peek = this.peekToken();
    const { type } = peek;
    if (
      type === lexer.TOKEN_VARIABLE_END ||
      type === lexer.TOKEN_BLOCK_END ||
      type === lexer.TOKEN_RPAREN
    ) {
      return true;
    } else if (extraEndRules) {
      return this.testAny(peek, extraEndRules);
    } else {
      return false;
    }
  }

  parseStatement(): t.Node | t.Node[] {
    const token = this.peekToken();
    if (token.type !== lexer.TOKEN_NAME) {
      this.fail("tag name expected", token.lineno, token.colno);
    }
    this._tagStack.push(token.value);
    let popTag = true;
    try {
      if (token.value in this._statementMethodMap) {
        const f = this._statementMethodMap[token.value as StatementKeyword];
        return f.apply(this);
      }
      if (token.value === "call") {
        return this.parseCallBlock();
      }
      if (token.value === "filter") {
        return this.parseFilterBlock();
      }
      for (let i = 0; i < this.extensions.length; i++) {
        const ext = this.extensions[i];
        if (ext.tags.indexOf(token.value)) {
          return ext.parse(this, t, b, lexer);
        }
      }
      this._tagStack.pop();
      popTag = false;
      this.fail(`Unknown tag ${token.value}`);
    } finally {
      if (popTag) {
        this._tagStack.pop();
      }
    }
    this.fail(`Unknown tag ${token.value}`);
  }

  parseIf(): t.If {
    const startTok = this.expect("name:if");
    const result = { type: "If" } as t.If;
    let node: t.If = result;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const currTok = this.current;
      node.test = this.parseTuple({ withCondExpr: false });
      node.body = this.parseStatements([
        "name:elif",
        "name:else",
        "name:endif",
      ]);
      node.elif = [];
      node.else_ = [];
      node.loc = this.tokToLoc(currTok, this.current);
      const nextTok = this.nextToken();
      if (nextTok?.value === "elif") {
        node = { type: "If" } as t.If;
        result.elif.push(node);
        continue;
      } else if (nextTok?.value === "else") {
        result.else_ = this.parseStatements(["name:endif"], {
          dropNeedle: true,
        });
      }
      break;
    }
    result.loc = this.tokToLoc(startTok, this.current);
    return result;
  }

  parseSet(): t.Assign | t.AssignBlock {
    const startTok = this.expect("name:set");
    const target = this.parseAssignTarget({ withNamespace: true });
    if (this.skip("assign")) {
      const expr = this.parseTuple();
      return b.assign.from({
        target,
        node: expr,
        loc: this.tokToLoc(startTok, this.current),
      });
    }
    const filter = this.parseFilter(null);
    const body = this.parseStatements(["name:endset"], { dropNeedle: true });
    return b.assignBlock.from({
      target,
      filter,
      body,
      loc: this.tokToLoc(startTok, this.current),
    });
  }

  subparse(endTokens?: string[]): t.Node[] {
    const body: t.Node[] = [];
    let dataBuffer: t.Expr[] = [];
    const addData = (v: t.Expr) => {
      dataBuffer.push(v);
    };
    if (endTokens && endTokens.length) {
      this._endTokenStack.push(endTokens);
    }

    const flushData = (): void => {
      if (dataBuffer.length) {
        body.push(
          b.output.from({
            nodes: dataBuffer.slice(),
            loc: this.tokToLoc(this.current),
          })
        );
        dataBuffer = [];
      }
    };

    try {
      while (this.peekToken().type !== lexer.TOKEN_EOF) {
        const token = this.peekToken();
        if (token.type === lexer.TOKEN_DATA) {
          if (token.value) {
            addData(
              b.templateData.from({
                data: token.value,
                loc: this.tokToLoc(token),
              })
            );
          }
          this.nextToken();
        } else if (token.type === lexer.TOKEN_VARIABLE_START) {
          this.nextToken();
          addData(this.parseTuple({ withCondExpr: true }));
          this.expect(lexer.TOKEN_VARIABLE_END);
        } else if (token.type === lexer.TOKEN_BLOCK_START) {
          flushData();
          this.nextToken();
          const peekTok = this.peekToken();
          if (
            endTokens?.length &&
            endTokens.some((rule) => this.test(peekTok, rule))
          ) {
            return body;
          }
          const rv = this.parseStatement();
          if (Array.isArray(rv)) {
            body.push(...rv);
          } else {
            body.push(rv);
          }
          this.expect(lexer.TOKEN_BLOCK_END);
        } else if (token.type === lexer.TOKEN_COMMENT) {
          this.nextToken();
        } else {
          this.fail("Internal parsing error");
        }
      }
      flushData();
    } finally {
      if (endTokens?.length) {
        this._endTokenStack.pop();
      }
    }
    return body;
  }

  parse(): t.Template {
    const startTok = this.current;
    const body = this.subparse();
    return b.template.from({
      body,
      loc: this.tokToLoc(startTok, this.current),
    });
  }
}

export function parse(
  src: string,
  extensions?: Extension[],
  opts?: lexer.TokenizerOptions
): t.Template {
  const p = new Parser(lexer.lex(src, opts));
  if (extensions !== undefined) {
    p.extensions = extensions;
  }
  return p.parse();
}
export { TemplateSyntaxError };

export type TokenizerOptions = lexer.TokenizerOptions;
