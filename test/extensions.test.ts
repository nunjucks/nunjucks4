import {
  Environment,
  ExprStmtExtension,
  LoopControlExtension,
  Extension,
} from "@nunjucks/environment";
import { describe, test, expect } from "@jest/globals";
import { Parser, Token, TokenStream, makeToken } from "@nunjucks/parser";
import { types, NunjucksTypes, Builders } from "@nunjucks/ast";
import { str } from "@nunjucks/runtime";

class ExampleExtension extends Extension {
  identifier = "ExampleExtension";
  tags = ["test"];
  extAttr = 42;
  contextReferenceNodeType: "ContextReference" | "DerivedContextReference" =
    "ContextReference";

  parse(parser: Parser, t: NunjucksTypes, b: Builders): types.Node {
    const loc = parser.tokToLoc(parser.stream.next().value);
    return b.output.from({
      nodes: [
        this.callMethod("_dump", {
          args: [
            b.environmentAttribute("sandboxed"),
            this.attr("extAttr"),
            { type: this.contextReferenceNodeType },
          ],
        }),
      ],
      loc,
    });
  }

  _dump(sandboxed: any, extAttr: any, context: any): string {
    return [sandboxed, extAttr, context.blocks, context.get("test_var")]
      .map((val) => str(val))
      .join("|");
  }
}

class DerivedExampleExtension extends ExampleExtension {
  identifier = "DerivedExampleExtension";
  contextReferenceNodeType: "ContextReference" | "DerivedContextReference" =
    "DerivedContextReference";
}

class PreprocessorExtension extends Extension {
  preprocess(source: string): string {
    return source.replace("[[TEST]]", "({{ foo }})");
  }
}

class StreamFilterExtension extends Extension {
  *filterStream(stream: TokenStream): Generator<Token> {
    for (const token of stream) {
      if (token.type === "data") {
        yield* this.interpolate(token);
      } else {
        yield token;
      }
    }
  }

  *interpolate(token: Token): Generator<Token> {
    let pos = 0;
    const regex = /_\((.*?)\)/gs;

    const end = token.value.length;
    let { colno, lineno } = token;
    while (true) {
      regex.lastIndex = pos;
      const match = regex.exec(token.value);
      if (!match) break;
      const value = token.value.substring(pos, match.index);
      if (value) {
        yield makeToken("data", value, lineno, colno, token.pos + pos, value);
        const numLines = value.match(/\n/g)?.length ?? 0;
        if (numLines) {
          lineno += numLines;
          colno = value.length - value.lastIndexOf("\n");
        } else {
          colno += value.length;
        }
        pos += value.length;
      }
      yield makeToken("variable_start", "", lineno, colno, token.pos + pos, "");
      yield makeToken("name", "gettext", lineno, colno, token.pos + pos, "");
      yield makeToken("lparen", "", lineno, colno, token.pos + pos, "");
      colno += 2;
      pos += 2;
      yield makeToken(
        "string",
        match[1],
        lineno,
        colno,
        token.pos + pos,
        match[1],
      );
      yield makeToken("rparen", "", lineno, colno, token.pos + pos, "");
      yield makeToken("variable_end", "", lineno, colno, token.pos + pos, "");
      pos = regex.lastIndex;
    }
    if (pos < end) {
      yield makeToken(
        "data",
        token.value.substring(pos),
        lineno,
        colno,
        token.pos + pos,
        token.value.substring(pos),
      );
    }
  }
}

describe("extensions", () => {
  let env: Environment<false>;

  beforeEach(() => {
    env = new Environment();
  });

  test("do", () => {
    env = new Environment({
      extensions: [ExprStmtExtension],
    });
    const tmpl = env.fromString(
      `
        {%- set items = [] %}
        {%- for char in "foo" %}
            {%- do items.push(loop.index0 ~ char) %}
        {%- endfor %}{{ items|join(', ') }}`,
    );
    expect(tmpl.render()).toBe("0f, 1o, 2o");
  });

  describe("loop controls", () => {
    beforeEach(() => {
      env = new Environment({ extensions: [LoopControlExtension] });
    });

    test("continue", () => {
      const tmpl = env.fromString(
        `
            {%- for item in [1, 2, 3, 4] %}
                {%- if item % 2 == 0 %}{% continue %}{% endif -%}
                {{ item }}
            {%- endfor %}`,
      );
      expect(tmpl.render()).toBe("13");
    });

    test("break", () => {
      const tmpl = env.fromString(
        `
            {%- for item in [1, 2, 3, 4] %}
                {%- if item > 2 %}{% break %}{% endif -%}
                {{ item }}
            {%- endfor %}`,
      );
      expect(tmpl.render()).toBe("12");
    });
  });

  test("streamfilter", () => {
    env = new Environment({ extensions: [StreamFilterExtension] });
    env.globals.gettext = (x: string) => x.toUpperCase();
    const tmpl = env.fromString("Foo _(bar) Baz");
    expect(tmpl.render()).toBe("Foo BAR Baz");
  });

  test("preprocessor", () => {
    env = new Environment({ extensions: [PreprocessorExtension] });
    const tmpl = env.fromString("{[[TEST]]}");
    expect(tmpl.render({ foo: 42 })).toBe("{(42)}");
  });

  test("extension ordering", () => {
    class T1 extends Extension {
      priority = 1;
    }
    class T2 extends Extension {
      priority = 2;
    }
    env = new Environment({ extensions: [T2, T1] });
    expect(env.extensionsList[0]).toBeInstanceOf(T1);
    expect(env.extensionsList[1]).toBeInstanceOf(T2);
  });

  test("overlay scopes", () => {
    class MagicScopeExtension extends Extension {
      identifier = "MagicScopeExtension";
      tags = ["overlay"];
      parse(parser: Parser, t: NunjucksTypes, b: Builders): types.Node {
        const loc = parser.tokToLoc(parser.stream.next().value);
        return b.overlayScope.from({
          context: this.callMethod("getScope"),
          body: parser.parseStatements(["name:endoverlay"], {
            dropNeedle: true,
          }),
          loc,
        });
      }
      getScope() {
        return { x: [1, 2, 3] };
      }
    }
    env = new Environment({ extensions: [MagicScopeExtension] });
    const tmpl = env.fromString(
      `
      {{- x }}|{% set z = 99 %}
      {%- overlay %}
          {{- y }}|{{ z }}|{% for item in x %}[{{ item }}]{% endfor %}
      {%- endoverlay %}|
      {{- x -}}
  `,
    );
    expect(tmpl.render({ x: 42, y: 23 })).toBe("42|23|99|[1][2][3]|42");
  });

  test("extension nodes", () => {
    env = new Environment({ extensions: [ExampleExtension] });
    const tmpl = env.fromString("{% test %}");
    expect(tmpl.render()).toBe("false|42|{}|null");
  });

  test("ContextReference node passes context", () => {
    env = new Environment({ extensions: [ExampleExtension] });
    const tmpl = env.fromString('{% set test_var="test_content" %}{% test %}');
    expect(tmpl.render()).toBe("false|42|{}|test_content");
  });

  test("ContextReference node can pass locals", () => {
    env = new Environment({ extensions: [DerivedExampleExtension] });
    const tmpl = env.fromString(
      '{% for test_var in ["test_content"] %}{% test %}{% endfor %}',
    );
    expect(tmpl.render()).toBe("false|42|{}|test_content");
  });

  test("basic scope behavior", () => {
    class ScopeExt extends Extension {
      tags = ["scope"];
      parse(parser: Parser, t: NunjucksTypes, b: Builders): types.Node {
        const loc = parser.tokToLoc(parser.stream.next().value);
        // const body: types.Node[] = [];
        const assignments: types.Node[] = [];
        while (parser.stream.current.type !== "block_end") {
          if (assignments.length) {
            parser.stream.expect("comma");
          }
          const innerLoc = parser.tokToLoc(parser.stream.current);
          const target = parser.parseAssignTarget();
          parser.stream.expect("assign");
          const expr = parser.parseExpression();
          assignments.push(
            b.assign.from({ target, node: expr, loc: innerLoc }),
          );
        }
        return b.scope.from({
          loc,
          body: [
            ...assignments,
            ...parser.parseStatements(["name:endscope"], { dropNeedle: true }),
          ],
        });
      }
    }
    env = new Environment({ extensions: [ScopeExt] });
    const tmpl = env.fromString(
      `{%- scope a=1, b=2, c=b, d=e, e=5 -%}
           {{ a }}|{{ b }}|{{ c }}|{{ d }}|{{ e }}
        {%- endscope -%}`,
    );
    expect(tmpl.render({ b: 3, e: 4 })).toBe("1|2|2|4|5");
  });
});
