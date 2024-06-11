import { Environment } from "@nunjucks/environment";
import { describe, expect, test } from "@jest/globals";
import { TemplateSyntaxError } from "@nunjucks/parser";
import { UndefinedError, nunjucksFunction } from "@nunjucks/runtime";
import { types as t } from "@nunjucks/ast";
let env: Environment<false>;

beforeEach(() => {
  env = new Environment({ async: false });
});

describe("parser", () => {
  test("php syntax", () => {
    env = new Environment({
      async: false,
      parserOpts: {
        blockStart: "<?",
        blockEnd: "?>",
        variableStart: "<?=",
        variableEnd: "?>",
        commentStart: "<!--",
        commentEnd: "-->",
      },
    });
    const tmpl = env.fromString(
      `<!-- I'm a comment, I'm not interesting -->
<?- for item in seq -?>
    <?= item ?>
<?- endfor ?>`,
    );
    expect(tmpl.render({ seq: [0, 1, 2, 3, 4] })).toBe("01234");
  });

  test("erb syntax", () => {
    env = new Environment({
      async: false,
      parserOpts: {
        blockStart: "<%",
        blockEnd: "%>",
        variableStart: "<%=",
        variableEnd: "%>",
        commentStart: "<%#",
        commentEnd: "%>",
      },
    });
    const tmpl = env.fromString(
      `<%# I'm a comment, I'm not interesting %>
      <%- for item in seq -%>
          <%= item %>
      <%- endfor %>`,
    );
    expect(tmpl.render({ seq: [0, 1, 2, 3, 4] })).toBe("01234");
  });

  test("comment syntax", () => {
    env = new Environment({
      async: false,
      parserOpts: {
        blockStart: "<!--",
        blockEnd: "-->",
        variableStart: "${",
        variableEnd: "}",
        commentStart: "<!--#",
        commentEnd: "-->",
      },
    });
    const tmpl = env.fromString(
      `<!--# I'm a comment, I'm not interesting -->
      <!--- for item in seq --->
          \${item}
      <!--- endfor -->`,
    );
    expect(tmpl.render({ seq: [0, 1, 2, 3, 4] })).toBe("01234");
  });

  test("balancing", () => {
    const tmpl = env.fromString("{{{'foo':'bar'}.foo}}");
    expect(tmpl.render()).toBe("bar");
  });

  test("start comment", () => {
    const tmpl = env.fromString(
      `{# foo comment
and bar comment #}
{% macro blub() %}foo{% endmacro %}
{{ blub() }}`,
    );
    expect(tmpl.render().trim()).toBe("foo");
  });

  test("line syntax", () => {
    env = new Environment({
      async: false,
      parserOpts: {
        blockStart: "<%",
        blockEnd: "%>",
        variableStart: "${",
        variableEnd: "}",
        commentStart: "<%#",
        commentEnd: "%>",
        lineStatementPrefix: "%",
        lineCommentPrefix: "##",
      },
    });
    const tmpl = env.fromString(
      [
        "<%# regular comment %>",
        "% for item in seq:",
        "    ${item} ## the rest of the stuff",
        "% endfor",
      ].join("\n"),
    );
    expect(
      tmpl
        .render({ seq: [0, 1, 2, 3, 4] })
        .split(/\s*/)
        .map((s) => s.trim())
        .join(""),
    ).toBe("01234");
  });
});

describe("syntax", () => {
  test("call", () => {
    env.globals.foo = nunjucksFunction(["a", "b", "c", "e", "g"])(
      (a: string, b: string, c: string, e: string, g: string): string =>
        a + b + c + e + g,
    );
    const tmpl = env.fromString(
      "{{ foo('a', c='d', e='f', *['b'], **{'g': 'h'}) }}",
    );
    expect(tmpl.render()).toBe("abdfh");
  });

  test("slicing", () => {
    const tmpl = env.fromString("{{ [1, 2, 3][:] }}|{{ [1, 2, 3][::-1] }}");
    expect(tmpl.render()).toBe("[1, 2, 3]|[3, 2, 1]");
  });

  test("attr", () => {
    const tmpl = env.fromString("{{ foo.bar }}|{{ foo['bar'] }}");
    expect(tmpl.render({ foo: { bar: 42 } })).toBe("42|42");
  });

  test("subscript", () => {
    const tmpl = env.fromString("{{ foo[0] }}|{{ foo[-1] }}");
    expect(tmpl.render({ foo: [0, 1, 2] })).toBe("0|2");
  });

  test("tuple", () => {
    const tmpl = env.fromString("{{ () }}|{{ (1,) }}|{{ (1, 2) }}");
    expect(tmpl.render()).toBe("[]|[1]|[1, 2]");
  });

  test("math", () => {
    const tmpl = env.fromString("{{ (1 + 1 * 2) - 3 / 2 }}|{{ 2**3 }}");
    expect(tmpl.render()).toBe("1.5|8");
  });

  test("div", () => {
    const tmpl = env.fromString("{{ 3 // 2 }}|{{ 3 / 2 }}|{{ 3 % 2 }}");
    expect(tmpl.render()).toBe("1|1.5|1");
  });

  test("unary", () => {
    const tmpl = env.fromString("{{ +3 }}|{{ -3 }}");
    expect(tmpl.render()).toBe("3|-3");
  });

  test("concat", () => {
    const tmpl = env.fromString("{{ [1, 2] ~ 'foo' }}");
    expect(tmpl.render()).toBe("[1, 2]foo");
  });

  test.each`
    a    | op      | b
    ${1} | ${">"}  | ${0}
    ${1} | ${">="} | ${1}
    ${2} | ${"<"}  | ${3}
    ${3} | ${"<="} | ${4}
    ${4} | ${"=="} | ${4}
    ${4} | ${"!="} | ${5}
  `("compare $a $op $b", ({ a, op, b }) => {
    const t = env.fromString(`{{ ${a} ${op} ${b} }}`);
    expect(t.render()).toBe("true");
  });

  test("compare parenthesis", () => {
    const t = env.fromString("{{ i * (j < 5) }}");
    expect(t.render({ i: 2, j: 3 })).toBe("2");
  });

  test.each`
    src            | expected
    ${"4 < 2 < 3"} | ${"false"}
    ${"a < b < c"} | ${"false"}
    ${"4 > 2 > 3"} | ${"false"}
    ${"a > b > c"} | ${"false"}
    ${"4 > 2 < 3"} | ${"true"}
    ${"a > b < c"} | ${"true"}
  `("compound compare ($src)", ({ src, expected }) => {
    const t = env.fromString(`{{ ${src} }}`);
    expect(t.render({ a: 4, b: 2, c: 3 })).toBe(expected);
  });

  test("in operation", () => {
    const tmpl = env.fromString(
      "{{ 1 in [1, 2, 3] }}|{{ 1 not in [1, 2, 3] }}",
    );
    expect(tmpl.render()).toBe("true|false");
  });

  test.each`
    src              | expected
    ${"1"}           | ${"1"}
    ${"123"}         | ${"123"}
    ${"12_34_56"}    | ${"123456"}
    ${"1.2"}         | ${"1.2"}
    ${"34.56"}       | ${"34.56"}
    ${"3_4.5_6"}     | ${"34.56"}
    ${"1e0"}         | ${"1"}
    ${"10e1"}        | ${"100"}
    ${"2.5e100"}     | ${"2.5e+100"}
    ${"2.5e+100"}    | ${"2.5e+100"}
    ${"25.6e-10"}    | ${"2.56e-9"}
    ${"1_2.3_4e5_6"} | ${"1.234e+57"}
    ${"0"}           | ${"0"}
    ${"0_00"}        | ${"0"}
    ${"0b1001_1111"} | ${"159"}
    ${"0o123"}       | ${"83"}
    ${"0o1_23"}      | ${"83"}
    ${"0x123abc"}    | ${"1194684"}
    ${"0x12_3abc"}   | ${"1194684"}
  `("numeric literal ($src)", ({ src, expected }) => {
    const t = env.fromString(`{{ ${src} }}`);
    expect(t.render({ a: 4, b: 2, c: 3 })).toBe(expected);
  });

  test("django-style numeric attribute", () => {
    const tmpl = env.fromString("{{ [1, 2, 3].0 }}|{{ [[1]].0.0 }}");
    expect(tmpl.render()).toBe("1|1");
  });

  test("conditional expression", () => {
    const tmpl = env.fromString("{{ 0 if true else 1 }}");
    expect(tmpl.render()).toBe("0");
  });

  test("short conditional expression", () => {
    let tmpl = env.fromString("<{{ 1 if false }}>");
    expect(tmpl.render()).toBe("<>");

    tmpl = env.fromString("<{{ (1 if false).bar }}>");
    expect(() => tmpl.render()).toThrow(UndefinedError);
  });

  test.each`
    args                           | expected
    ${"*foo, bar"}                 | ${"invalid"}
    ${"*foo, *bar"}                | ${"invalid"}
    ${"**foo, *bar"}               | ${"invalid"}
    ${"**foo, bar"}                | ${"invalid"}
    ${"**foo, **bar"}              | ${"invalid"}
    ${"**foo, bar=42"}             | ${"invalid"}
    ${"foo, bar"}                  | ${"valid"}
    ${"foo, bar=42"}               | ${"valid"}
    ${"foo, bar=23, *args"}        | ${"valid"}
    ${"foo, *args, bar=23"}        | ${"valid"}
    ${"a, b=c, *d, **e"}           | ${"valid"}
    ${"*foo, bar=42"}              | ${"valid"}
    ${"*foo, **bar"}               | ${"valid"}
    ${"*foo, bar=42, **baz"}       | ${"valid"}
    ${"foo, *args, bar=23, **baz"} | ${"valid"}
  `("function call fn($args) is $expected", ({ args, expected }) => {
    if (expected === "valid") {
      env.fromString(`{{ foo(${args}) }}`);
    } else {
      expect(() => env.fromString(`{{ foo(${args}) }}`)).toThrow(
        TemplateSyntaxError,
      );
    }
  });

  test("bool", () => {
    const tmpl = env.fromString(
      "{{ true and false }}|{{ false or true }}|{{ not false }}",
    );
    expect(tmpl.render()).toBe("false|true|true");
  });

  test("grouping", () => {
    const tmpl = env.fromString(
      "{{ (true and false) or (false and true) and not false }}",
    );
    expect(tmpl.render()).toBe("false");
  });

  test("filter priority", () => {
    const tmpl = env.fromString('{{ "foo"|upper + "bar"|upper }}');
    expect(tmpl.render()).toBe("FOOBAR");
  });

  test.each([
    ["{{ () }}"],
    ["{{ (1, 2) }}"],
    ["{{ (1, 2,) }}"],
    ["{{ 1, }}"],
    ["{{ 1, 2 }}"],
    ["{% for foo, bar in seq %}...{% endfor %}"],
    ["{% for x in foo, bar %}...{% endfor %}"],
    ["{% for x in foo, %}...{% endfor %}"],
  ])("tuple expression in '%s' is valid", (src) => {
    env.fromString(src);
  });

  test("trailing_comma", () => {
    const tmpl = env.fromString("{{ (1, 2,) }}|{{ [1, 2,] }}|{{ {1: 2,} }}");
    expect(tmpl.render()).toBe("[1, 2]|[1, 2]|{'1': 2}");
  });

  test("block-end name", () => {
    env.fromString("{% block foo %}...{% endblock foo %}");
    expect(() => env.fromString("{% block x %}{% endblock y %}")).toThrow(
      TemplateSyntaxError,
    );
  });

  test.each([["True"], ["False"], ["None"]])(
    "casing for '%s' literal",
    (title) => {
      const upper = title.toUpperCase();
      const lower = title.toLowerCase();
      const tmpl = env.fromString(
        `{{ ${title} }}|{{ ${upper} }}|{{ ${lower} }}`,
      );
      const expected = lower === "none" ? "null" : lower;
      expect(tmpl.render()).toBe(`${expected}|${expected}|${expected}`);
    },
  );

  test("chaining", () => {
    expect(() => env.fromString("{{ foo is string is sequence }}")).toThrow(
      TemplateSyntaxError,
    );
    expect(env.fromString("{{ 42 is string or 42 is number }}").render()).toBe(
      "true",
    );
  });

  test("string concatenation", () => {
    const tmpl = env.fromString('{{ "foo" "bar" "baz" }}');
    expect(tmpl.render()).toBe("foobarbaz");
  });

  test("notin", () => {
    const bar = [...new Array(100)].map((_, i) => i);
    const tmpl = env.fromString("{{ not 42 in bar }}");
    expect(tmpl.render({ bar })).toBe("false");
  });

  test("operator precedence", () => {
    const tmpl = env.fromString("{{ 2 * 3 + 4 % 2 + 1 - 2 }}");
    expect(tmpl.render()).toBe("5");
  });

  test("raw", () => {
    const tmpl = env.fromString("{% raw %}{{ FOO }} and {% BAR %}{% endraw %}");
    expect(tmpl.render()).toBe("{{ FOO }} and {% BAR %}");
  });

  test("const", () => {
    const tmpl = env.fromString(
      "{{ true }}|{{ false }}|{{ none }}|" +
        "{{ none is defined }}|{{ missing is defined }}",
    );
    expect(tmpl.render()).toBe("true|false|null|true|false");
  });

  test("negation filter priority", () => {
    const node = env.parse("{{ -1|foo }}") as any;
    t.Filter.assert(node.body[0].nodes[0]);
    t.Neg.assert(node.body[0].nodes[0].node);
  });

  test("const assign", () => {
    expect(() => env.fromString("{% set true = 42 %}")).toThrow(
      TemplateSyntaxError,
    );
    expect(() => env.fromString("{% for none in seq %}{% endfor %}")).toThrow(
      TemplateSyntaxError,
    );
  });

  test("localset", () => {
    const tmpl = env.fromString(
      `{% set foo = 0 %}` +
        "{% for item in [1, 2] %}{% set foo = 1 %}{% endfor %}" +
        "{{ foo }}",
    );
    expect(tmpl.render()).toBe("0");
  });

  test("parse unary", () => {
    let tmpl = env.fromString('{{ -foo["bar"] }}');
    expect(tmpl.render({ foo: { bar: 42 } })).toBe("-42");
    tmpl = env.fromString('{{ -foo["bar"]|abs }}');
    expect(tmpl.render({ foo: { bar: 42 } })).toBe("42");
  });

  test("lstrip", () => {
    env = new Environment({
      async: false,
      parserOpts: { lstripBlocks: true, trimBlocks: false },
    });
    const tmpl = env.fromString("    {% if True %}\n    {% endif %}");
    expect(tmpl.render()).toBe("\n");
  });

  test("lstrip trim", () => {
    env = new Environment({
      async: false,
      parserOpts: { lstripBlocks: true, trimBlocks: true },
    });
    const tmpl = env.fromString("    {% if True %}\n    {% endif %}");
    expect(tmpl.render()).toBe("");
  });

  test("lstrip tag disable", () => {
    env = new Environment({
      async: false,
      parserOpts: { lstripBlocks: true, trimBlocks: false },
    });
    const tmpl = env.fromString("    {%+ if True %}\n    {%+ endif %}");
    expect(tmpl.render()).toBe("    \n    ");
  });

  test("lstrip blocks false with lstrip tag disable", () => {
    env = new Environment({
      async: false,
      parserOpts: { lstripBlocks: false, trimBlocks: true },
    });
    const tmpl = env.fromString("    {% if True +%}\n    {% endif %}");
    expect(tmpl.render()).toBe("    \n    ");
  });

  test("lstrip endline", () => {
    env = new Environment({
      async: false,
      parserOpts: { lstripBlocks: true, trimBlocks: false },
    });
    const tmpl = env.fromString(
      "    hello{% if True %}\n    goodbye{% endif %}",
    );
    expect(tmpl.render()).toBe("    hello\n    goodbye");
  });

  test("lstrip inline", () => {
    env = new Environment({
      async: false,
      parserOpts: { lstripBlocks: true, trimBlocks: false },
    });
    const tmpl = env.fromString("    {% if True %}hello    {% endif %}");
    expect(tmpl.render()).toBe("hello    ");
  });

  test("lstrip nested", () => {
    env = new Environment({
      async: false,
      parserOpts: { lstripBlocks: true, trimBlocks: false },
    });
    const tmpl = env.fromString(
      "    {% if True %}a {% if True %}b {% endif %}c {% endif %}",
    );
    expect(tmpl.render()).toBe("a b c ");
  });

  test("lstrip left chars", () => {
    env = new Environment({
      async: false,
      parserOpts: { lstripBlocks: true, trimBlocks: false },
    });
    const tmpl = env.fromString(
      `    abc {% if True %}
    hello{% endif %}`,
    );
    expect(tmpl.render()).toBe("    abc \n    hello");
  });

  test("lstrip embedded strings", () => {
    env = new Environment({
      async: false,
      parserOpts: { lstripBlocks: true, trimBlocks: false },
    });
    const tmpl = env.fromString(`    {% set x = " {% str %} " %}{{ x }}`);
    expect(tmpl.render()).toBe(" {% str %} ");
  });
});
