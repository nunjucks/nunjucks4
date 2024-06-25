import {
  Environment,
  ExprStmtExtension,
  LoopControlExtension,
  Extension,
} from "@nunjucks/environment";
import { describe, test, expect } from "@jest/globals";
import { Token, TokenStream, makeToken } from "@nunjucks/parser";

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
    expect(env.extensions[0]).toBeInstanceOf(T1);
    expect(env.extensions[1]).toBeInstanceOf(T2);
  });
});
