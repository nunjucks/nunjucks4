import { types as t, builders as b, canAssign } from "@nunjucks/ast";
import * as lexer from "./lexer";
import type { IEnvironment } from "@nunjucks/runtime";
import {
  TemplateSyntaxError,
  Token,
  TokenStream,
  Lexer,
  getLexer,
  makeToken,
} from "./lexer";
import { ITemplateInfo } from "@nunjucks/runtime";

export interface Extension {
  tags: string[];
  parse(
    self: Parser,
    types: typeof t,
    builders: typeof b,
    lexer: any,
  ): t.Node | t.Node[];
}

const assertName: (typeof t.Name)["assert"] = t.Name.assert.bind(t.Name);

const compareOperatorsList = ["eq", "ne", "lt", "lteq", "gt", "gteq"] as const;

type CompareOperator = (typeof compareOperatorsList)[number];

const compareOperators = new Set<CompareOperator>(compareOperatorsList);

function isCompareOperator(val: string): val is CompareOperator {
  return (compareOperators as Set<string>).has(val);
}

interface BinaryBuilder {
  (left: t.Expr, right: t.Expr): t.Expr;
  from(params: {
    left: t.Expr;
    loc?: t.SourceLocation | null;
    operator?: string;
    right: t.Expr;
  }): t.Expr;
}

const mathNodes: Readonly<Record<string, BinaryBuilder>> = Object.freeze({
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

interface ParserOptions {
  extensions?: Extension[];
  name?: string | null;
  filename?: string | null;
}
export type LexerOptions = lexer.LexerOptions;
export type ParseOptions = lexer.LexerOptions & ParserOptions;

type Environment<IsAsync extends boolean = boolean> = IEnvironment<IsAsync> & {
  _tokenize(
    source: string,
    opts: ITemplateInfo & {
      state: string | null;
    },
  ): TokenStream;
  extensionsList: Extension[];
  parserOpts: ParserOptions;
};

export class Parser {
  stream: lexer.TokenStream;
  name: string | null;
  filename: string | null;
  peeked: lexer.Token | null;
  current: lexer.Token;
  breakOnBlocks: string[] | null;
  dropLeadingWhitespace: boolean;
  extensions: Extension[];
  _endTokenStack: string[][];
  _tagStack: string[];

  _statementMethodMap: Record<
    StatementKeyword,
    (this: Parser) => t.Node | t.Node[]
  >;

  constructor(
    stream: lexer.TokenStream,
    { extensions = [], name = null, filename = null }: ParserOptions = {},
  ) {
    this.stream = stream;
    this.name = name;
    this.filename = filename;
    this.extensions = extensions;
    this.peeked = null;
    this.stream.current = stream.current;
    this.breakOnBlocks = null;
    this.dropLeadingWhitespace = false;
    this._endTokenStack = [];
    this._tagStack = [];
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

  static fromEnvironment(
    environment: Environment,
    source: string,
    {
      name = null,
      filename = null,
      state = null,
    }: {
      name?: string | null;
      filename?: string | null;
      state?: string | null;
    } = {},
  ): Parser {
    const stream = environment._tokenize(source, { name, filename, state });
    return new Parser(stream, {
      name,
      filename,
      extensions: environment.extensionsList,
      ...environment.parserOpts,
    });
  }

  error(msg: string, lineno?: number, colno?: number): TemplateSyntaxError {
    if (lineno === undefined || colno === undefined) {
      const tok = this.stream.current || {};
      lineno = tok.lineno;
      colno = tok.colno;
    }
    return new TemplateSyntaxError(msg, {
      lineno,
      name: this.name,
      filename: this.filename,
    });
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

  nodeLoc(node: t.Node, endNode?: t.Node): t.SourceLocation {
    const start = node.loc!.start;
    const endLoc = (endNode ?? node).loc!;
    const end = endLoc.end!;
    return {
      start,
      end,
      source: this.stream.str.substring(start.pos, end.pos),
    };
  }

  tokToLoc(token: Token, endToken?: Token): t.SourceLocation {
    const source = endToken
      ? this.stream.str.substring(token.pos, endToken.pos + endToken.raw.length)
      : token.raw;
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
    const startPos = token.pos;
    const endPos = (endToken ?? token).pos + (endToken ?? token).raw.length;
    return {
      start: {
        line: token.lineno,
        column: token.colno,
        pos: startPos,
      },
      end: {
        line: endLine,
        column: endColumn,
        pos: endPos,
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

  parseAssignTarget(): t.Tuple;

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
    if (withNamespace && this.stream.look().type === lexer.TOKEN_DOT) {
      const token = this.stream.expect("name");
      this.stream.expect("dot");
      const attr = this.stream.expect("name");
      target = b.nsRef.from({
        name: token.value,
        attr: attr.value,
        loc: this.tokToLoc(token, attr),
      });
    } else if (nameOnly) {
      const token = this.stream.expect(lexer.TOKEN_NAME);
      target = b.name.from({
        name: token.value,
        ctx: "store",
        loc: this.tokToLoc(token),
      });
    } else {
      if (withTuple) {
        target = this.parseTuple({ simplified: true, extraEndRules });
        try {
          assertNameOrTuple(target);
        } catch (err) {
          this.fail(`${err}`);
        }
      } else {
        target = this.parsePrimary();
        assertName(target);
      }
      target.ctx = "store";
    }
    if (!canAssign(target)) {
      this.fail(`Can't assign to ${target.type}`);
    }
    return target;
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
    let locToken = this.stream.current;
    let expr1: t.Expr = this.parseOr();
    let expr2: t.Expr | null;
    let test: t.Expr;
    while (this.stream.skipIf("name:if")) {
      test = this.parseOr();
      if (this.stream.skipIf("name:else")) {
        expr2 = this.parseCondExpr();
      } else {
        expr2 = null;
      }
      expr1 = b.condExpr.from({
        test,
        expr1,
        expr2,
        loc: this.tokToLoc(locToken, this.stream.current),
      });
      locToken = this.stream.current;
    }
    return expr1;
  }

  parseOr(): t.Expr {
    let locToken = this.stream.current;
    let left: t.Expr = this.parseAnd();
    while (this.stream.skipIf("name:or")) {
      const right = this.parseAnd();
      left = b.or.from({
        left,
        right,
        loc: this.tokToLoc(locToken, this.stream.current),
      });
      locToken = this.stream.current;
    }
    return left;
  }

  parseAnd(): t.Expr {
    let locToken = this.stream.current;
    let left: t.Expr = this.parseNot();
    while (this.stream.skipIf("name:and")) {
      const right = this.parseNot();
      left = b.and.from({
        left,
        right,
        loc: this.tokToLoc(locToken, this.stream.current),
      });
      locToken = this.stream.current;
    }
    return left;
  }

  parseNot(): t.Expr {
    if (this.test(this.stream.current, "name:not")) {
      const startTok = this.stream.next().value;
      return b.not.from({
        node: this.parseNot(),
        loc: this.tokToLoc(startTok, this.stream.current),
      });
    }
    return this.parseCompare();
  }

  parseCompare(): t.Expr {
    let locToken = this.stream.current;
    const expr = this.parseMath1();
    const ops: t.Operand[] = [];
    while (true) {
      const tokenType = this.stream.current.type;
      if (isCompareOperator(tokenType)) {
        this.stream.next();
        ops.push(
          b.operand.from({
            op: tokenType,
            expr: this.parseMath1(),
          }),
        );
      } else if (this.stream.skipIf("name:in")) {
        ops.push(
          b.operand.from({
            op: "in",
            expr: this.parseMath1(),
          }),
        );
      } else if (
        this.test(this.stream.current, "name:not") &&
        this.test(this.stream.look(), "name:in")
      ) {
        this.stream.skip(2);
        ops.push(
          b.operand.from({
            op: "notin",
            expr: this.parseMath1(),
          }),
        );
      } else {
        break;
      }
      locToken = this.stream.current;
    }
    if (!ops.length) {
      return expr;
    }
    return b.compare.from({
      ops,
      expr,
      loc: this.tokToLoc(locToken, this.stream.current),
    });
  }

  parseMath1(): t.Expr {
    let locToken = this.stream.current;
    let left: t.Expr = this.parseConcat();
    while (
      this.stream.current.type === "add" ||
      this.stream.current.type === "sub"
    ) {
      const builder = mathNodes[this.stream.current.type];
      this.stream.next();
      const right = this.parseConcat();
      left = builder.from({
        left,
        right,
        loc: this.tokToLoc(locToken, this.stream.current),
      });
      locToken = this.stream.current;
    }
    return left;
  }

  parseConcat(): t.Expr {
    const locToken = this.stream.current;
    const nodes: t.Expr[] = [this.parseMath2()];
    while (this.stream.skipIf(lexer.TOKEN_TILDE)) {
      nodes.push(this.parseMath2());
    }
    if (nodes.length === 1) {
      return nodes[0];
    }
    return b.concat.from({
      nodes,
      loc: this.tokToLoc(locToken, this.stream.current),
    });
  }

  parseMath2(): t.Expr {
    let locToken = this.stream.current;
    let left: t.Expr = this.parsePow();
    while (
      this.stream.current.type === "mul" ||
      this.stream.current.type === "div" ||
      this.stream.current.type === "floordiv" ||
      this.stream.current.type === "mod"
    ) {
      const builder = mathNodes[this.stream.current.type];
      this.stream.next();
      const right = this.parsePow();
      left = builder.from({
        left,
        right,
        loc: this.tokToLoc(locToken, this.stream.current),
      });
      locToken = this.stream.current;
    }
    return left;
  }

  parsePow(): t.Expr {
    let locTok = this.stream.current;
    let left: t.Expr = this.parseUnary();
    while (this.stream.current.type === "pow") {
      this.stream.next();
      const right = this.parseUnary();
      left = b.pow.from({
        left,
        right,
        loc: this.tokToLoc(locTok, this.stream.current),
      });
      locTok = this.stream.current;
    }
    return left;
  }

  parseUnary({ withFilter = true }: { withFilter?: boolean } = {}): t.Expr {
    const startTok = this.stream.current;
    let node: t.Expr;

    if (this.stream.skipIf("sub")) {
      node = b.neg.from({
        node: this.parseUnary({ withFilter: false }),
        loc: this.tokToLoc(startTok, this.stream.current),
      });
    } else if (this.stream.skipIf("add")) {
      node = b.pos.from({
        node: this.parseUnary({ withFilter: false }),
        loc: this.tokToLoc(startTok, this.stream.current),
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
    const token = this.stream.current;
    const loc = this.tokToLoc(token);
    if (this.stream.skipIf("name")) {
      if (
        ["true", "false", "True", "False", "TRUE", "FALSE"].indexOf(
          token.value,
        ) !== -1
      ) {
        return b.const.from({
          value:
            token.value === "true" ||
            token.value === "True" ||
            token.value === "TRUE",
          loc,
        });
      } else if (
        token.value === "none" ||
        token.value === "None" ||
        token.value === "NONE" ||
        token.value === "null"
      ) {
        return b.const.from({ value: null, loc });
      } else {
        return b.name.from({ name: token.value, ctx: "load", loc });
      }
    } else if (this.stream.skipIf("string")) {
      const buf: string[] = [token.value];
      while (this.stream.current.type === "string") {
        buf.push(this.stream.current.value);
        this.stream.next();
      }
      return b.const.from({
        value: buf.join(""),
        loc: this.tokToLoc(token, this.stream.current),
      });
    } else if (this.stream.skipIf("int") || this.stream.skipIf("float")) {
      return b.const.from({ value: token.value, loc });
    } else if (this.stream.skipIf(lexer.TOKEN_LPAREN)) {
      const node = this.parseTuple({ explicitParentheses: true });
      this.stream.expect(lexer.TOKEN_RPAREN);
      return node;
    } else if (token.type === lexer.TOKEN_LBRACKET) {
      return this.parseList();
    } else if (token.type === lexer.TOKEN_LBRACE) {
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
    let locTok = this.stream.current;
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
    while (true) {
      if (args.length) {
        this.stream.expect("comma");
      }
      if (this.isTupleEnd(extraEndRules)) {
        break;
      }
      args.push(parse());
      if (this.stream.current.type === "comma") {
        isTuple = true;
      } else {
        break;
      }
      locTok = this.stream.current;
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
      loc: this.tokToLoc(locTok, this.stream.current),
    });
  }

  parseList(): t.List {
    const token = this.stream.expect("lbracket");
    const items: t.Expr[] = [];
    while (this.stream.current.type !== lexer.TOKEN_RBRACKET) {
      if (items.length) {
        this.stream.expect(lexer.TOKEN_COMMA);
      }
      if ((this.stream.current.type as any) === lexer.TOKEN_RBRACKET) {
        break;
      }
      items.push(this.parseExpression());
    }
    this.stream.expect(lexer.TOKEN_RBRACKET);
    return b.list.from({
      items,
      loc: this.tokToLoc(token, this.stream.current),
    });
  }

  parseDict(): t.Dict {
    const token = this.stream.expect("lbrace");
    const items: t.Pair[] = [];
    while (this.stream.current.type !== lexer.TOKEN_RBRACE) {
      if (items.length) {
        this.stream.expect(lexer.TOKEN_COMMA);
      }
      if ((this.stream.current.type as any) === lexer.TOKEN_RBRACE) {
        break;
      }
      const key = this.parseExpression();
      this.stream.expect(lexer.TOKEN_COLON);
      const value = this.parseExpression();
      items.push(
        b.pair.from({
          key,
          value,
          loc: this.tokToLoc(token, this.stream.current),
        }),
      );
    }
    this.stream.expect(lexer.TOKEN_RBRACE);
    return b.dict.from({
      items,
      loc: this.tokToLoc(token, this.stream.current),
    });
  }

  parsePostfix(node: t.Expr): t.Expr {
    while (true) {
      const tokenType = this.stream.current.type;
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
    while (true) {
      const tokenType = this.stream.current.type;
      if (tokenType === lexer.TOKEN_PIPE) {
        node = this.parseFilter(node);
      } else if (
        tokenType === lexer.TOKEN_NAME &&
        this.stream.current.value === "is"
      ) {
        node = this.parseTest(node);
      } else if (tokenType === lexer.TOKEN_LPAREN) {
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
    const token = this.stream.next().value;
    if (token.type === lexer.TOKEN_DOT) {
      const attrToken = this.stream.current;
      this.stream.next();
      if (attrToken.type === lexer.TOKEN_NAME) {
        return b.getattr.from({
          node,
          attr: attrToken.value,
          ctx: "load",
          loc: this.tokToLoc(token, attrToken),
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
        loc: this.tokToLoc(token, this.stream.current),
      });
    } else if (token.type === lexer.TOKEN_LBRACKET) {
      const args: t.Expr[] = [];
      while (this.stream.current.type !== lexer.TOKEN_RBRACKET) {
        if (args.length) {
          this.stream.expect(lexer.TOKEN_COMMA);
        }
        args.push(this.parseSubscribed());
      }
      this.stream.expect(lexer.TOKEN_RBRACKET);
      const arg =
        args.length === 1
          ? args[0]
          : b.tuple.from({
              items: args,
              ctx: "load",
              loc: this.tokToLoc(token, this.stream.current),
            });
      return b.getitem.from({
        node,
        arg,
        ctx: "load",
        loc: this.tokToLoc(token, this.stream.current),
      });
    }
    const { lineno, colno } = token;
    this.fail("expected subscript expression", lineno, colno);
  }

  parseSubscribed(): t.Expr {
    const token = this.stream.current;

    let start: t.Expr | null = null;
    let stop: t.Expr | null = null;
    let step: t.Expr | null = null;

    if (this.stream.skipIf(lexer.TOKEN_COLON)) {
      start = null;
    } else {
      const node = this.parseExpression();
      if (!this.stream.skipIf(lexer.TOKEN_COLON)) {
        return node;
      }
      start = node;
    }

    if (this.stream.current.type === lexer.TOKEN_COLON) {
      stop = null;
    } else if (
      this.stream.current.type !== lexer.TOKEN_RBRACKET &&
      this.stream.current.type !== lexer.TOKEN_COMMA
    ) {
      stop = this.parseExpression();
    } else {
      stop = null;
    }

    if (this.stream.skipIf(lexer.TOKEN_COLON)) {
      if (
        this.stream.current.type !== lexer.TOKEN_RBRACKET &&
        this.stream.current.type !== lexer.TOKEN_COMMA
      ) {
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
      loc: this.tokToLoc(token, this.stream.current),
    });
  }

  parseCallArgs(): {
    args: t.Expr[];
    kwargs: t.Keyword[];
    dynArgs: t.Expr | null;
    dynKwargs: t.Expr | null;
  } {
    const token = this.stream.expect(lexer.TOKEN_LPAREN);
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

    while (this.stream.current.type !== lexer.TOKEN_RPAREN) {
      if (requireComma) {
        this.stream.expect(lexer.TOKEN_COMMA);
        // support for trailing comma
        if ((this.stream.current.type as any) === lexer.TOKEN_RPAREN) {
          break;
        }
      }
      if (this.stream.current.type === lexer.TOKEN_MUL) {
        ensure(dynArgs === null && dynKwargs === null);
        this.stream.next();
        dynArgs = this.parseExpression();
      } else if (this.stream.current.type === lexer.TOKEN_POW) {
        ensure(dynKwargs === null);
        this.stream.next();
        dynKwargs = this.parseExpression();
      } else {
        const argToken = this.stream.current;
        if (
          this.stream.current.type === lexer.TOKEN_NAME &&
          this.stream.look().type === lexer.TOKEN_ASSIGN
        ) {
          // Parsing a kwarg
          ensure(dynKwargs === null);
          const key = this.stream.current.value;
          this.stream.skip(2);
          const value = this.parseExpression();
          kwargs.push(
            b.keyword.from({
              key,
              value,
              loc: this.tokToLoc(argToken, this.stream.current),
            }),
          );
        } else {
          // Parsing an arg
          ensure(dynArgs === null && dynKwargs === null && !kwargs.length);
          args.push(this.parseExpression());
        }
      }
      requireComma = true;
    }
    this.stream.expect(lexer.TOKEN_RPAREN);
    return { args, kwargs, dynArgs, dynKwargs };
  }

  parseCall(node: t.Expr): t.Call {
    const start = this.stream.previous;
    const token = this.stream.current;
    const { args, kwargs, dynArgs, dynKwargs } = this.parseCallArgs();
    return b.call.from({
      node,
      args,
      kwargs,
      dynArgs,
      dynKwargs,
      loc: this.tokToLoc(start ?? token, this.stream.previous!),
    });
  }

  parseFilter<T extends t.Expr | null>(
    node: T,
    { startInline = false }: { startInline?: boolean } = {},
  ): T {
    while (this.stream.current.type === lexer.TOKEN_PIPE || startInline) {
      if (!startInline) {
        this.stream.next();
      }
      const token = this.stream.expect(lexer.TOKEN_NAME);
      let name = token.value;
      while (this.stream.skipIf(lexer.TOKEN_DOT)) {
        name += `.${this.stream.expect(lexer.TOKEN_NAME).value}`;
      }
      let args: t.Expr[] = [];
      let kwargs: t.Keyword[] = [];
      let dynArgs: t.Expr | null = null;
      let dynKwargs: t.Expr | null = null;

      if (this.stream.current.type === lexer.TOKEN_LPAREN) {
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
        loc: this.tokToLoc(token, this.stream.current),
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
    const token = this.stream.next().value;
    let negated = false;
    if (this.test(this.stream.current, "name:not")) {
      this.stream.next();
      negated = true;
    }

    const nameParts = [this.stream.expect("name").value];
    while (this.stream.current.type === lexer.TOKEN_DOT) {
      this.stream.next();
      nameParts.push(this.stream.expect("name").value);
    }
    const name = nameParts.join(".");

    let args: t.Expr[] = [];
    let kwargs: t.Keyword[] = [];
    let dynArgs: t.Expr | null = null;
    let dynKwargs: t.Expr | null = null;
    if (this.stream.current.type === lexer.TOKEN_LPAREN) {
      const callArgs = this.parseCallArgs();
      args = callArgs.args;
      kwargs = callArgs.kwargs.map((t) => b.keyword(t.key, t.value));
      dynArgs = callArgs.dynArgs;
      dynKwargs = callArgs.dynKwargs;
    } else if (
      argTypes.has(this.stream.current.type) &&
      logicalOpRules.every((r) => !this.test(this.stream.current, r))
    ) {
      if (this.test(this.stream.current, "name:is")) {
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
      loc: this.tokToLoc(token, this.stream.current),
    });
    if (negated) {
      node = b.not.from({
        node,
        loc: this.tokToLoc(token, this.stream.current),
      });
    }
    return node;
  }

  parseStatements(
    endTokens: string[],
    { dropNeedle = false }: { dropNeedle?: boolean } = {},
  ): t.Node[] {
    // the first token may be a colon for python compatibility
    this.stream.skipIf(lexer.TOKEN_COLON);

    // in the future it would be possible to add whole code sections
    // by adding some sort of end of statement token and parsing those here.
    this.stream.expect(lexer.TOKEN_BLOCK_END);

    const result = this.subparse(endTokens);

    // we reached the end of the template too early, the subparser
    // does not check for this, so we do that now

    if (this.stream.current.type === lexer.TOKEN_EOF) {
      this.fail("Unexpected end of template");
    }
    if (dropNeedle) {
      this.stream.next();
    }
    return result;
  }

  parseFor(): t.Loop {
    const startTok = this.stream.previous!;
    const forTok = this.stream.current;
    let nodeBuilder: keyof typeof b;
    let endBlock: string;

    if (this.stream.skipIf("name:for")) {
      nodeBuilder = "for";
      endBlock = "endfor";
    } else if (this.stream.skipIf("name:asyncEach")) {
      nodeBuilder = "for";
      endBlock = "endeach";
    } else if (this.stream.skipIf("name:asyncAll")) {
      nodeBuilder = "asyncAll";
      endBlock = "endall";
    } else {
      this.fail("parseFor: expected for{Async}", forTok.lineno, forTok.colno);
    }

    const target = this.parseAssignTarget({ extraEndRules: ["name:in"] });
    this.stream.expect("name:in");
    const iter = this.parseTuple({
      withCondExpr: false,
      extraEndRules: ["name:recursive"],
    });
    let test = null;
    if (this.stream.skipIf("name:if")) {
      test = this.parseExpression();
    }
    const recursive = this.stream.skipIf("name:recursive");
    const body = this.parseStatements([`name:${endBlock}`, "name:else"]);
    let else_: t.Node[] = [];
    if (this.stream.next().value.value !== endBlock) {
      else_ = this.parseStatements([`name:${endBlock}`], { dropNeedle: true });
    }
    return b[nodeBuilder].from({
      target,
      iter,
      body,
      else_,
      test,
      recursive,
      loc: this.tokToLoc(startTok, this.stream.current),
    });
  }

  parseWith(): t.With {
    const startTok = this.stream.next().value;
    const targets: t.Expr[] = [];
    const values: t.Expr[] = [];
    while (this.stream.current.type !== lexer.TOKEN_BLOCK_END) {
      if (targets.length) {
        this.stream.expect(lexer.TOKEN_COMMA);
      }
      const target = this.parseAssignTarget({});
      if (t.NSRef.check(target)) {
        // TODO: fix this type inference
        this.fail("Unexpected NSRef");
      }
      target.ctx = "param";
      targets.push(target);
      this.stream.expect(lexer.TOKEN_ASSIGN);
      values.push(this.parseExpression());
    }
    const body = this.parseStatements(["name:endwith"], { dropNeedle: true });
    return b.with.from({
      targets,
      values,
      body,
      loc: this.tokToLoc(startTok, this.stream.current),
    });
  }

  parseAutoescape(): t.Scope {
    const startTok = this.stream.next().value;
    const options: t.Keyword[] = [
      b.keyword.from({
        key: "autoescape",
        value: this.parseExpression(),
        loc: this.tokToLoc(startTok, this.stream.current),
      }),
    ];
    const body = this.parseStatements(["name:endautoescape"], {
      dropNeedle: true,
    });
    const node = b.scopedEvalContextModifier.from({
      options,
      body,
      loc: this.tokToLoc(startTok, this.stream.current),
    });
    return b.scope.from({
      body: [node],
      loc: this.tokToLoc(startTok, this.stream.current),
    });
  }

  parseBlock(): t.Block {
    const token = this.stream.next().value;

    const name = this.stream.expect("name").value;
    const scoped = this.stream.skipIf("name:scoped");
    const required = this.stream.skipIf("name:required");

    if (this.stream.current.type === "sub") {
      this.fail(
        "Block names may not contain hyphens, use an underscore instead.",
      );
    }

    const body = this.parseStatements(["name:endblock"], { dropNeedle: true });

    if (required) {
      if (
        !body.every(
          (b) =>
            t.Output.check(b) &&
            b.nodes.every(
              (c) => t.TemplateData.check(c) && !c.data.match(/\S/),
            ),
        )
      ) {
        this.fail("Required blocks can only contain comments or whitespace");
      }
    }
    this.stream.skipIf(`name:${name}`);
    return b.block.from({
      name,
      scoped,
      required,
      body,
      loc: this.tokToLoc(token, this.stream.current),
    });
  }

  parseExtends(): t.Extends {
    const token = this.stream.next().value;
    const template = this.parseExpression();
    return b.extends.from({
      template,
      loc: this.tokToLoc(token, this.stream.current),
    });
  }

  parseImportContext(default_: boolean): boolean {
    let withContext = default_;

    if (
      this.testAny(this.stream.current, ["name:with", "name:without"]) &&
      this.test(this.stream.look(), "name:context")
    ) {
      withContext = this.stream.next().value.value === "with";
      this.stream.skip();
    }

    return withContext;
  }

  parseInclude(): t.Include {
    const token = this.stream.next().value;
    const template = this.parseExpression();
    let ignoreMissing = false;
    if (
      this.test(this.stream.current, "name:ignore") &&
      this.test(this.stream.look(), "name:missing")
    ) {
      ignoreMissing = true;
      this.stream.skip(2);
    }

    return b.include.from({
      template,
      ignoreMissing,
      withContext: this.parseImportContext(true),
      loc: this.tokToLoc(token, this.stream.current),
    });
  }

  parseImport(): t.Import {
    const token = this.stream.next().value;
    const template = this.parseExpression();
    this.stream.expect("name:as");
    const target = this.parseAssignTarget({ nameOnly: true }).name;
    return b.import.from({
      template,
      target,
      withContext: this.parseImportContext(false),
      loc: this.tokToLoc(token, this.stream.current),
    });
  }

  parseFrom(): t.FromImport {
    const token = this.stream.next().value;
    const template = this.parseExpression();
    this.stream.expect("name:import");
    const names: (string | string[])[] = [];
    let withContext = false;

    const parseContext: () => boolean = () => {
      if (this.testAny(this.stream.current, ["name:with", "name:without"])) {
        if (this.test(this.stream.look(), "name:context")) {
          withContext = this.stream.next().value.value === "with";
          this.stream.skip();
          return true;
        }
      }

      return false;
    };

    while (true) {
      if (names.length) {
        this.stream.expect("comma");
      }
      if (this.stream.current.type === "name") {
        if (parseContext()) {
          break;
        }
        const targetTok = this.stream.current;
        const target = this.parseAssignTarget({ nameOnly: true });
        if (target.name.startsWith("_")) {
          const { lineno, colno } = targetTok;
          this.fail(
            "names starting with an underline can not be imported",
            lineno,
            colno,
          );
        }
        if (this.stream.skipIf("name:as")) {
          const alias = this.parseAssignTarget({ nameOnly: true });
          names.push([target.name, alias.name]);
        } else {
          names.push(target.name);
        }
        if (parseContext() || (this.stream.current.type as any) !== "comma") {
          break;
        }
      } else {
        this.stream.expect("name");
      }
    }
    return b.fromImport.from({
      template,
      names,
      withContext,
      loc: this.tokToLoc(token, this.stream.current),
    });
  }

  parseSignature(): { args: t.Name[]; defaults: t.Expr[] } {
    const args: t.Name[] = [];
    const defaults: t.Expr[] = [];
    this.stream.expect("lparen");
    while (this.stream.current.type !== "rparen") {
      if (args.length) {
        this.stream.expect("comma");
      }
      const arg = this.parseAssignTarget({ nameOnly: true });
      assertName(arg);
      arg.ctx = "param";
      if (this.stream.skipIf("assign")) {
        defaults.push(this.parseExpression());
      } else if (defaults.length) {
        this.fail("non-default argument follows default argument");
      }
      args.push(arg);
    }
    this.stream.expect("rparen");
    return { args, defaults };
  }

  parseCallBlock(): t.CallBlock {
    const token = this.stream.next().value;
    let args: t.Name[] = [];
    let defaults: t.Expr[] = [];
    if (this.stream.current.type === "lparen") {
      const signature = this.parseSignature();
      args = signature.args;
      defaults = signature.defaults;
    }
    const callTok = this.stream.current;
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
      loc: this.tokToLoc(token, this.stream.current),
    });
  }

  parseFilterBlock(): t.FilterBlock {
    const token = this.stream.next().value;
    const filter = this.parseFilter(null, { startInline: true });
    t.Filter.assert(filter);
    const body = this.parseStatements(["name:endfilter"], { dropNeedle: true });
    return b.filterBlock.from({
      filter,
      body,
      loc: this.tokToLoc(token, this.stream.current),
    });
  }

  parseMacro(): t.Macro {
    const token = this.stream.next().value;
    const name = this.parseAssignTarget({ nameOnly: true }).name;
    const { args, defaults } = this.parseSignature();
    const body = this.parseStatements(["name:endmacro"], { dropNeedle: true });
    return b.macro.from({
      name,
      args,
      defaults,
      body,
      loc: this.tokToLoc(token, this.stream.current),
    });
  }

  parsePrint(): t.Output {
    const nodes: t.Expr[] = [];
    while (this.stream.current.type !== lexer.TOKEN_BLOCK_END) {
      if (nodes.length) {
        this.stream.expect("comma");
      }
      nodes.push(this.parseExpression());
    }
    let loc: t.SourceLocation | null = null;
    if (nodes.length) {
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      loc = this.nodeLoc(first, last);
    }
    return b.output.from({
      nodes,
      loc,
    });
  }

  isTupleEnd(extraEndRules?: string[]): boolean {
    const peek = this.stream.current;
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
    const token = this.stream.current;
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

      for (const ext of this.extensions) {
        if (ext.tags.includes(token.value)) {
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
    const startTok = this.stream.previous ?? this.stream.current;
    this.stream.expect("name:if");
    const result = { type: "If" } as t.If;
    let node: t.If = result;
    while (true) {
      const currTok = this.stream.current;
      node.test = this.parseTuple({ withCondExpr: false });
      node.body = this.parseStatements([
        "name:elif",
        "name:elseif",
        "name:else",
        "name:endif",
      ]);
      node.elif = [];
      node.else_ = [];
      node.loc = this.tokToLoc(currTok, this.stream.current);
      const nextTok = this.stream.next().value;
      if (this.testAny(nextTok, ["name:elif", "name:elseif"])) {
        node = { type: "If" } as t.If;
        result.elif.push(node);
        continue;
      } else if (this.test(nextTok, "name:else")) {
        result.else_ = this.parseStatements(["name:endif"], {
          dropNeedle: true,
        });
      }
      break;
    }
    result.loc = this.tokToLoc(startTok, this.stream.current);
    return result;
  }

  parseSet(): t.Assign | t.AssignBlock {
    const startTok = this.stream.previous!;
    this.stream.expect("name:set");
    const target = this.parseAssignTarget({ withNamespace: true });
    if (this.stream.skipIf("assign")) {
      const expr = this.parseTuple();
      return b.assign.from({
        target,
        node: expr,
        loc: this.tokToLoc(startTok, this.stream.current),
      });
    }
    const filter = this.parseFilter(null);
    const body = this.parseStatements(["name:endset"], { dropNeedle: true });
    return b.assignBlock.from({
      target,
      filter,
      body,
      loc: this.tokToLoc(startTok, this.stream.current),
    });
  }

  subparse(endTokens?: string[]): t.Node[] {
    const body: t.Node[] = [];
    let dataBuffer: t.Expr[] = [];
    const addData = (v: t.Expr) => {
      dataBuffer.push(v);
    };
    if (endTokens?.length) {
      this._endTokenStack.push(endTokens);
    }

    const flushData = (): void => {
      if (dataBuffer.length) {
        const loc = this.nodeLoc(
          dataBuffer[0],
          dataBuffer[dataBuffer.length - 1],
        );
        body.push(
          b.output.from({
            nodes: dataBuffer.slice(),
            loc,
          }),
        );
        dataBuffer = [];
      }
    };

    try {
      while (this.stream.current.type !== lexer.TOKEN_EOF) {
        const token = this.stream.current;
        if (token.type === lexer.TOKEN_DATA) {
          if (token.value) {
            addData(
              b.templateData.from({
                data: token.value,
                loc: this.tokToLoc(token),
              }),
            );
          }
          this.stream.next();
        } else if (token.type === lexer.TOKEN_VARIABLE_START) {
          this.stream.next();
          addData(this.parseTuple({ withCondExpr: true }));
          this.stream.expect(lexer.TOKEN_VARIABLE_END);
        } else if (token.type === lexer.TOKEN_BLOCK_START) {
          flushData();
          this.stream.next();
          if (
            endTokens?.length &&
            endTokens.some((rule) => this.test(this.stream.current, rule))
          ) {
            return body;
          }
          const rv = this.parseStatement();
          if (Array.isArray(rv)) {
            body.push(...rv);
          } else {
            body.push(rv);
          }
          this.stream.expect(lexer.TOKEN_BLOCK_END);
        } else if (token.type === lexer.TOKEN_COMMENT) {
          this.stream.next();
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
    const startTok = this.stream.current;
    const body = this.subparse();
    return b.template.from({
      body,
      loc: this.tokToLoc(startTok, this.stream.current),
    });
  }
}

export function parse(src: string, opts?: Partial<ParseOptions>): t.Template;
export function parse(
  src: string,
  extensions: Extension[],
  opts?: Partial<ParseOptions>,
): t.Template;

export function parse(
  src: string,
  extensionsOrOpts?: Extension[] | Partial<ParseOptions>,
  opts?: Partial<ParseOptions>,
): t.Template {
  if (Array.isArray(extensionsOrOpts)) {
    const extensions = extensionsOrOpts;
    const { name, filename, ...lexerOpts } = opts ?? {};
    const p = new Parser(lexer.lex(src, lexerOpts), {
      extensions,
      name,
      filename,
    });
    return p.parse();
  } else {
    const { name, filename, extensions, ...lexerOpts } = extensionsOrOpts ?? {};
    const p = new Parser(lexer.lex(src, lexerOpts), {
      extensions,
      name,
      filename,
    });
    return p.parse();
  }
}
export { TemplateSyntaxError };

export { lexer, Token, TokenStream, Lexer, getLexer, makeToken };
