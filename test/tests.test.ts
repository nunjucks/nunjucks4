import { Environment } from "@nunjucks/environment";
import { Markup } from "@nunjucks/runtime";
import { describe, expect, it, beforeEach } from "@jest/globals";

describe("tests", () => {
  let env: Environment<false>;

  beforeEach(() => {
    env = new Environment();
  });

  it("defined", () => {
    const tmpl = env.fromString(
      "{{ missing is defined }}|{{ true is defined }}"
    );
    expect(tmpl.render()).toBe("false|true");
  });

  it("even", () => {
    const tmpl = env.fromString("{{ 1 is even }}|{{ 2 is even }}");
    expect(tmpl.render()).toBe("false|true");
  });

  it("odd", () => {
    const tmpl = env.fromString("{{ 1 is odd }}|{{ 2 is odd }}");
    expect(tmpl.render()).toBe("true|false");
  });

  it("lower", () => {
    const tmpl = env.fromString('{{ "foo" is lower }}|{{ "FOO" is lower }}');
    expect(tmpl.render()).toBe("true|false");
  });

  it("upper", () => {
    const tmpl = env.fromString('{{ "foo" is upper }}|{{ "FOO" is upper }}');
    expect(tmpl.render()).toBe("false|true");
  });

  it.each([
    ["none is none", true],
    ["false is none", false],
    ["true is none", false],
    ["42 is none", false],
    ["none is true", false],
    ["false is true", false],
    ["true is true", true],
    ["0 is true", false],
    ["1 is true", false],
    ["42 is true", false],
    ["none is false", false],
    ["false is false", true],
    ["true is false", false],
    ["0 is false", false],
    ["1 is false", false],
    ["42 is false", false],
    ["none is boolean", false],
    ["false is boolean", true],
    ["true is boolean", true],
    ["0 is boolean", false],
    ["1 is boolean", false],
    ["42 is boolean", false],
    ["0.0 is boolean", false],
    ["1.0 is boolean", false],
    ["3.14159 is boolean", false],
    ["none is integer", false],
    ["false is integer", false],
    ["true is integer", false],
    ["42 is integer", true],
    ["3.14159 is integer", false],
    ["(10 ** 100) is integer", true],
    ["none is float", false],
    ["false is float", false],
    ["true is float", false],
    ["42 is float", false],
    ["4.2 is float", true],
    ["(10 ** 100) is float", false],
    ["none is number", false],
    // ["false is number", true],
    // ["true is number", true],
    ["42 is number", true],
    ["3.14159 is number", true],
    ["(10 ** 100) is number", true],
    ["none is string", false],
    ["false is string", false],
    ["true is string", false],
    ["42 is string", false],
    ['"foo" is string', true],
    ["none is sequence", false],
    ["false is sequence", false],
    ["42 is sequence", false],
    ['"foo" is sequence', true],
    ["[] is sequence", true],
    ["[1, 2, 3] is sequence", true],
    // ["{} is sequence", true],
    ["none is mapping", false],
    ["false is mapping", false],
    ["42 is mapping", false],
    ['"foo" is mapping', false],
    ["[] is mapping", false],
    ["{} is mapping", true],
    ["none is iterable", false],
    ["false is iterable", false],
    ["42 is iterable", false],
    ['"foo" is iterable', true],
    ["[] is iterable", true],
    // ["{} is iterable", true],
    ["range(5) is iterable", true],
    ["none is callable", false],
    ["false is callable", false],
    ["42 is callable", false],
    ['"foo" is callable', false],
    ["[] is callable", false],
    ["{} is callable", false],
    ["range is callable", true],
  ])("%s === %s", (op, expected) => {
    const tmpl = env.fromString(`{{ ${op} }}`);
    expect(tmpl.render()).toBe(`${expected}`);
  });

  it("equalto", () => {
    const tmpl = env.fromString(
      [
        "{{ foo is eq 12 }}",
        "{{ foo is eq 0 }}",
        "{{ foo is eq (3 * 4) }}",
        '{{ bar is eq "baz" }}',
        '{{ bar is eq "zab" }}',
        '{{ bar is eq ("ba" + "z") }}',
        "{{ bar is eq bar }}",
        "{{ bar is eq foo }}",
      ].join("|")
    );
    expect(tmpl.render({ foo: 12, bar: "baz" })).toBe(
      "true|false|true|true|false|true|true|false"
    );
  });

  it.each([
    ["eq 2", true],
    ["eq 3", false],
    ["ne 3", true],
    ["ne 2", false],
    ["lt 3", true],
    ["lt 2", false],
    ["le 2", true],
    ["le 1", false],
    ["gt 1", true],
    ["gt 2", false],
    ["ge 2", true],
    ["ge 3", false],
  ])("%s === %s", (op, expected) => {
    const tmpl = env.fromString(`{{ 2 is ${op} }}`);
    expect(tmpl.render()).toBe(`${expected}`);
  });

  it("sameas", () => {
    const tmpl = env.fromString(
      "{{ foo is sameas false }}|{{ 0 is sameas false }}"
    );
    expect(tmpl.render({ foo: false })).toBe("true|false");
  });

  it("escaped", () => {
    env.autoescape = true;
    const tmpl = env.fromString("{{ x is escaped }}|{{ y is escaped }}");
    expect(tmpl.render({ x: "foo", y: new Markup("foo") })).toBe("false|true");
  });

  it("greaterthan", () => {
    const tmpl = env.fromString(
      "{{ 1 is greaterthan 0 }}|{{ 0 is greaterthan 1 }}"
    );
    expect(tmpl.render()).toBe("true|false");
  });

  it("lessthan", () => {
    const tmpl = env.fromString("{{ 0 is lessthan 1 }}|{{ 1 is lessthan 0 }}");
    expect(tmpl.render()).toBe("true|false");
  });

  it("multiple tests", () => {
    const items: [string, string][] = [];
    env.tests.matching = (x: string, y: string) => {
      items.push([x, y]);
      return false;
    };
    const tmpl = env.fromString(
      `{{ 'us-west-1' is matching '(us-east-1|ap-northeast-1)'
         or 'stage' is matching '(dev|stage)' }}`
    );
    expect(tmpl.render()).toBe("false");
    expect(items).toStrictEqual([
      ["us-west-1", "(us-east-1|ap-northeast-1)"],
      ["stage", "(dev|stage)"],
    ]);
  });

  it("in", () => {
    const tmpl = env.fromString(
      [
        '{{ "o" is in "foo" }}',
        '{{ "foo" is in "foo" }}',
        '{{ "b" is in "foo" }}',
        "{{ 1 is in ((1, 2)) }}",
        "{{ 3 is in ((1, 2)) }}",
        "{{ 1 is in [1, 2] }}",
        "{{ 3 is in [1, 2] }}",
        '{{ "foo" is in {"foo": 1}}}',
        '{{ "baz" is in {"bar": 1}}}',
      ].join("|")
    );
    expect(tmpl.render()).toBe(
      "true|true|false|true|false|true|false|true|false"
    );
  });

  it("name undefined", () => {
    expect(() => env.fromString("{{ x is f }}")).toThrow("No test named 'f'");
  });

  it("name undefined", () => {
    const tmpl = env.fromString("{% if x is defined %}{{ x is f }}{% endif %}");
    expect(tmpl.render()).toBe("");
    expect(() => tmpl.render({ x: 1 })).toThrow("No test named 'f'");
  });

  it("test filter", () => {
    const tmpl = env.fromString("{{ 'trim' is filter }}|{{ 'f' is filter }}");
    expect(tmpl.render()).toBe("true|false");
  });

  it("test test", () => {
    const tmpl = env.fromString("{{ 'defined' is test }}|{{ 'f' is test }}");
    expect(tmpl.render()).toBe("true|false");
  });
});
