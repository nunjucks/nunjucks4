import {
  Environment,
  TemplateNotFound,
  TemplatesNotFound,
  ObjectSourceLoader,
} from "@nunjucks/environment";
import { describe, expect, test } from "@jest/globals";
import { TemplateSyntaxError } from "@nunjucks/parser";
import { UndefinedError, nunjucksFunction } from "@nunjucks/runtime";

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
<?- endfor ?>`
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
      <%- endfor %>`
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
      <!--- endfor -->`
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
{{ blub() }}`
    );
    expect(tmpl.render().trim()).toBe("foo");
  });

  test.skip("line syntax", () => {
    env = new Environment({
      async: false,
      parserOpts: {
        blockStart: "<%",
        blockEnd: "%>",
        variableStart: "${",
        variableEnd: "}",
        commentStart: "<%#",
        commentEnd: "%>",
      },
    });
    const tmpl = env.fromString(
      [
        "<%# regular comment %>",
        "% for item in seq:",
        "    ${item}",
        "% endfor`",
      ].join("\n")
    );
    expect(tmpl.render({ seq: [0, 1, 2, 3, 4] })).toBe("01234");
  });
});

describe("syntax", () => {
  test("call", () => {
    env.globals.foo = nunjucksFunction(["a", "b", "c", "e", "g"])(
      (a: string, b: string, c: string, e: string, g: string): string =>
        a + b + c + e + g
    );
    const tmpl = env.fromString(
      "{{ foo('a', c='d', e='f', *['b'], **{'g': 'h'}) }}"
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
      "{{ 1 in [1, 2, 3] }}|{{ 1 not in [1, 2, 3] }}"
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
  test("django_attr", () => {
    const tmpl = env.fromString("{{ [1, 2, 3].0 }}|{{ [[1]].0.0 }}");
    expect(tmpl.render()).toBe("1|1");
  });

  test("conditional_expression", () => {
    const tmpl = env.fromString("{{ 0 if true else 1 }}");
    expect(tmpl.render()).toBe("0");
  });

  test("short_conditional_expression", () => {
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
        TemplateSyntaxError
      );
    }
  });
  });

  test("trailing_comma", () => {
    const tmpl = env.fromString("{{ (1, 2,) }}|{{ [1, 2,] }}|{{ {1: 2,} }}");
    expect(tmpl.render()).toBe("[1, 2]|[1, 2]|{'1': 2}");
  });
});
