import { Environment } from "./environment";

import type { TokenStream, Token } from "@nunjucks/parser";
import { Parser } from "@nunjucks/parser";
import { types as t, builders as b } from "@nunjucks/ast";

export class Extension {
  tags: string[];
  priority: number = 100;
  environment: Environment;
  identifier: string;

  constructor(environment: Environment) {
    this.environment = environment;
  }

  preprocess(
    source: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    opts?: { name?: string | null; filename?: string | null },
  ) {
    return source;
  }

  filterStream(stream: TokenStream): TokenStream | Iterable<Token> {
    return stream;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parse(parser: Parser): t.Node | t.Node[] {
    throw new Error("Not implemented");
  }

  attr(name: string, loc?: t.SourceLocation | null): t.ExtensionAttribute {
    return b.extensionAttribute.from({
      identifier: this.identifier,
      name,
      loc,
    });
  }

  callMethod(
    name: string,
    {
      args = [],
      kwargs = [],
      dynArgs = null,
      dynKwargs = null,
      loc = null,
    }: {
      args?: t.Expr[];
      kwargs?: t.Keyword[];
      dynArgs?: t.Expr | null;
      dynKwargs?: t.Expr | null;
      loc?: t.SourceLocation | null;
    },
  ): t.Call {
    return b.call.from({
      node: this.attr(name, loc),
      args,
      kwargs,
      dynArgs,
      dynKwargs,
      loc,
    });
  }
}

export class ExprStmtExtension extends Extension {
  tags = ["do"];

  parse(parser: Parser): t.ExprStmt {
    const token = parser.stream.next().value;
    return b.exprStmt.from({
      node: parser.parseTuple(),
      loc: parser.tokToLoc(token, parser.stream.current),
    });
  }
}

export class LoopControlExtension extends Extension {
  tags = ["break", "continue"];

  parse(parser: Parser): t.Break | t.Continue {
    const token = parser.stream.next().value;
    const loc = parser.tokToLoc(token);
    if (token.value === "break") {
      return b.break.from({ loc });
    } else {
      return b.continue.from({ loc });
    }
  }
}
