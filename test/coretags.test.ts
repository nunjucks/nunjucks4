import { Environment, ObjectSourceLoader } from "@nunjucks/environment";
import { describe, expect, test, it } from "@jest/globals";
import { TemplateSyntaxError } from "@nunjucks/parser";

describe("for loop", () => {
  let env: Environment<false>;

  beforeEach(() => {
    env = new Environment();
  });

  it("simple", () => {
    const tmpl = env.fromString("{% for item in seq %}{{ item }}{% endfor %}");
    const seq = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(tmpl.render({ seq })).toBe("0123456789");
  });

  it("else", () => {
    const tmpl = env.fromString(
      "{% for item in seq %}XXX{% else %}...{% endfor %}"
    );
    expect(tmpl.render()).toBe("...");
  });

  it("else scoping", () => {
    const tmpl = env.fromString(
      "{% for item in [] %}{% else %}{{ item }}{% endfor %}"
    );
    expect(tmpl.render({ item: 42 })).toBe("42");
  });

  it("empty blocks", () => {
    const tmpl = env.fromString(
      "<{% for item in seq %}{% else %}{% endfor %}>"
    );
    expect(tmpl.render()).toBe("<>");
  });

  it("context vars", () => {
    const slist = [42, 24];
    const tmpl = env.fromString(`
      {%- for item in seq -%}
        index={{ loop.index }}|index0={{ loop.index0 }}|revindex={{ loop.revindex }}|revindex0={{
            loop.revindex0 }}|first={{ loop.first }}|last={{ loop.last }}|length={{
           loop.length }}|value={{ item }}###
      {%- endfor -%}
    `);
    function* gen() {
      yield 42;
      yield 24;
    }
    [slist, gen()].forEach((seq) => {
      const [one, two] = tmpl.render({ seq }).split("###");
      const kv1 = Object.fromEntries(one.split("|").map((s) => s.split("=")));
      const kv2 = Object.fromEntries(two.split("|").map((s) => s.split("=")));
      expect([kv1, kv2]).toStrictEqual([
        {
          first: "true",
          index: "1",
          index0: "0",
          last: "false",
          length: "",
          revindex: "1",
          revindex0: "0",
          value: "42",
        },
        {
          first: "false",
          index: "2",
          index0: "1",
          last: "true",
          length: "",
          revindex: "0",
          revindex0: "-1",
          value: "24",
        },
      ]);
    });
  });
  it("cycling", () => {
    const tmpl = env.fromString(`
      {%- for item in seq %}{{
      loop.cycle('<1>', '<2>') }}{% endfor %}{%
      for item in seq %}{{ loop.cycle(*through) }}{% endfor %}`);
    const output = tmpl.render({
      seq: [0, 1, 2, 3],
      through: ["<1>", "<2>"],
    });
    expect(output).toBe("<1><2><1><2><1><2><1><2>");
  });

  it("lookaround", () => {
    const tmpl = env.fromString(`
    {%- for item in seq -%}
      {{ loop.previtem|default('x') }}-{{ item }}-{{
      loop.nextitem|default('x') }}|
    {%- endfor %}`);
    const output = tmpl.render({ seq: [0, 1, 2, 3] });
    expect(output).toBe("x-0-1|0-1-2|1-2-3|2-3-x|");
  });

  it("loop.changed", () => {
    const tmpl = env.fromString(
      `{% for item in seq -%}{{ loop.changed(item) }},{%- endfor %}`
    );
    const output = tmpl.render({ seq: [null, null, 1, 2, 2, 3, 4, 4, 4] });
    expect(output).toBe("true,false,true,true,false,true,true,false,false,");
  });

  it("scope", () => {
    const tmpl = env.fromString("{% for item in seq %}{% endfor %}{{ item }}");
    expect(tmpl.render({ seq: [0, 1, 2] })).toBe("");
  });

  it("noniterable", () => {
    const tmpl = env.fromString("{% for item in none %}...{% endfor %}");
    expect(() => tmpl.render()).toThrow("null is not iterable");
  });

  it("recursive", () => {
    const tmpl = env.fromString(`
      {%- for item in seq recursive -%}
        [{{ item.a }}{% if item.b %}<{{ loop(item.b) }}>{% endif %}]
      {%- endfor %}`);
    const seq = [
      { a: 1, b: [{ a: 1 }, { a: 2 }] },
      { a: 2, b: [{ a: 1 }, { a: 2 }] },
      { a: 3, b: [{ a: "a" }] },
    ];
    expect(tmpl.render({ seq })).toBe("[1<[1][2]>][2<[1][2]>][3<[a]>]");
  });

  it("recursive lookaround", () => {
    const tmpl = env.fromString(`
      {%- for item in seq recursive -%}
        [{{ loop.previtem.a if loop.previtem is defined else 'x' }}.{{
        item.a }}.{{ loop.nextitem.a if loop.nextitem is defined else 'x'
        }}{% if item.b %}<{{ loop(item.b) }}>{% endif %}]
      {%- endfor %}`);
    const seq = [
      { a: 1, b: [{ a: 1 }, { a: 2 }] },
      { a: 2, b: [{ a: 1 }, { a: 2 }] },
      { a: 3, b: [{ a: "a" }] },
    ];
    expect(tmpl.render({ seq })).toBe(
      "[x.1.2<[x.1.2][1.2.x]>][1.2.3<[x.1.2][1.2.x]>][2.3.x<[x.a.x]>]"
    );
  });

  it("recursive depth0", () => {
    const tmpl = env.fromString(`
      {%- for item in seq recursive -%}
        [{{ loop.depth0 }}:{{ item.a }}{% if item.b %}<{{ loop(item.b) }}>{% endif %}]
      {%- endfor %}`);
    const seq = [
      { a: 1, b: [{ a: 1 }, { a: 2 }] },
      { a: 2, b: [{ a: 1 }, { a: 2 }] },
      { a: 3, b: [{ a: "a" }] },
    ];
    expect(tmpl.render({ seq })).toBe(
      "[0:1<[1:1][1:2]>][0:2<[1:1][1:2]>][0:3<[1:a]>]"
    );
  });

  it("recursive depth", () => {
    const tmpl = env.fromString(`
      {%- for item in seq recursive -%}
        [{{ loop.depth }}:{{ item.a }}{% if item.b %}<{{ loop(item.b) }}>{% endif %}]
      {%- endfor %}`);
    const seq = [
      { a: 1, b: [{ a: 1 }, { a: 2 }] },
      { a: 2, b: [{ a: 1 }, { a: 2 }] },
      { a: 3, b: [{ a: "a" }] },
    ];
    expect(tmpl.render({ seq })).toBe(
      "[1:1<[2:1][2:2]>][1:2<[2:1][2:2]>][1:3<[2:a]>]"
    );
  });

  it("nested loop variable", () => {
    const tmpl = env.fromString(`
      {%- for row in table %}
        {%- set rowloop = loop -%}
        {% for cell in row -%}
          [{{ rowloop.index }}|{{ loop.index }}]
        {%- endfor %}
      {%- endfor %}`);
    expect(tmpl.render({ table: ["ab", "cd"] })).toBe("[1|1][1|2][2|1][2|2]");
  });

  it("loop errors", () => {
    let tmpl = env.fromString(
      "{% for item in [1] if loop.index == 0 %}...{% endfor %}"
    );
    expect(() => tmpl.render()).toThrow('"loop" is undefined');
    tmpl = env.fromString(
      "{% for item in [] %}...{% else %}{{ loop }}{% endfor %}"
    );
    expect(tmpl.render()).toBe("");
  });

  it.skip("loop filter", () => {
    let tmpl = env.fromString(
      "{% for item in range(10) if item is even %}[{{ item }}]{% endfor %}"
    );
    expect(tmpl.render()).toBe("[0][2][4][6][8]");
    tmpl = env.fromString(`
      {%- for item in range(10) if item is even -%}
      [{{ loop.index }}:{{ item }}]
      {%- endfor %}`);
    expect(tmpl.render()).toBe("[1:0][2:2][3:4][4:6][5:8]");
  });

  it("loop unassignable", () => {
    expect(() =>
      env.fromString("{% for loop in seq %}...{% endfor %}")
    ).toThrow("Cannot assign to special loop variable in for-loop");
  });

  it("scoped special variable", () => {
    const tmpl = env.fromString(
      [
        "{% for s in seq %}[{{ loop.first }}{% for c in s %}",
        "{{ loop.first }}{% endfor %}]{% endfor %}",
      ].join("|")
    );
    expect(tmpl.render({ seq: ["ab", "cd"] })).toBe(
      "[true|true|false][false|true|false]"
    );
  });

  it("scoped loop var", () => {
    let tmpl = env.fromString(
      "{% for x in seq %}{{ loop.first }}{% for y in seq %}{% endfor %}{% endfor %}"
    );
    expect(tmpl.render({ seq: "ab" })).toBe("truefalse");
    tmpl = env.fromString(
      "{% for x in seq %}{% for y in seq %}{{ loop.first }}{% endfor %}{% endfor %}"
    );
    expect(tmpl.render({ seq: "ab" })).toBe("truefalsetruefalse");
  });

  it("recursive empty loop iter", () => {
    let tmpl = env.fromString(
      "{%- for item in foo recursive -%}{%- endfor -%}"
    );
    expect(tmpl.render({ foo: [] })).toBe("");
  });

  it("call in loop", () => {
    const tmpl = env.fromString(`
    {%- macro do_something() -%}
      [{{ caller() }}]
    {%- endmacro %}

    {%- for i in [1, 2, 3] %}
      {%- call do_something() -%}
        {{ i }}
      {%- endcall %}
    {%- endfor -%}
    `);
    expect(tmpl.render()).toBe("[1][2][3]");
  });

  it("macro loop scoping", () => {
    const tmpl = env.fromString(`
      {%- for item in foo %}...{{ item }}...{% endfor -%}
      {%- macro item(a) %}...{{ a }}...{% endmacro -%}
      {{- item(2) -}}`);
    expect(tmpl.render({ foo: [1] })).toBe("...1......2...");
  });

  it("unpacking", () => {
    const tmpl = env.fromString(
      "{% for a, b, c in [[1, 2, 3]] %}{{ a }}|{{ b }}|{{ c }}{% endfor %}"
    );
    expect(tmpl.render()).toBe("1|2|3");
  });

  it("intended scoping with set", () => {
    let tmpl = env.fromString(
      "{% for item in seq %}{{ x }}{% set x = item %}{{ x }}{% endfor %}"
    );
    expect(tmpl.render({ x: 0, seq: [1, 2, 3] })).toBe("010203");
    tmpl = env.fromString(
      [
        "{% set x = 9 %}{% for item in seq %}{{ x }}",
        "{% set x = item %}{{ x }}{% endfor %}",
      ].join("")
    );
    expect(tmpl.render({ x: 0, seq: [1, 2, 3] })).toBe("919293");
  });
});

describe("if condition", () => {
  let env: Environment<false>;

  beforeEach(() => {
    env = new Environment();
  });

  it("simple", () => {
    const tmpl = env.fromString("{% if true %}...{% endif %}");
    expect(tmpl.render()).toBe("...");
  });

  it("elif", () => {
    const tmpl = env.fromString(
      "{% if false %}XXX{% elif true %}...{% else %}XXX{% endif %}"
    );
    expect(tmpl.render()).toBe("...");
  });

  it("elif deep", () => {
    const elifs = [...new Array(1000)]
      .map((_, i) => `{% elif a == ${i} %}${i}`)
      .join("\n");
    const tmpl = env.fromString(
      `{% if a == 0 %}0${elifs}{% else %}x{% endif %}`
    );
    expect(tmpl.render({ a: 0 }).trim()).toBe("0");
    expect(tmpl.render({ a: 10 }).trim()).toBe("10");
    expect(tmpl.render({ a: 999 }).trim()).toBe("999");
    expect(tmpl.render({ a: 1000 }).trim()).toBe("x");
  });

  it("else", () => {
    const tmpl = env.fromString("{% if false %}XXX{% else %}...{% endif %}");
    expect(tmpl.render()).toBe("...");
  });

  it("empty", () => {
    const tmpl = env.fromString("[{% if true %}{% else %}{% endif %}]");
    expect(tmpl.render()).toBe("[]");
  });

  it("complete", () => {
    const tmpl = env.fromString(
      "{% if a %}A{% elif b %}B{% elif c == d %}C{% else %}D{% endif %}"
    );
    expect(tmpl.render({ a: 0, b: false, c: 42, d: 42 })).toBe("C");
  });

  it("scope", () => {
    let tmpl = env.fromString(
      "{% if a %}{% set foo = 1 %}{% endif %}{{ foo }}"
    );
    expect(tmpl.render({ a: true })).toBe("1");
    tmpl = env.fromString("{% if true %}{% set foo = 1 %}{% endif %}{{ foo }}");
    expect(tmpl.render()).toBe("1");
  });
});

describe("macros", () => {
  let env: Environment<false>;

  beforeEach(() => {
    env = new Environment({ parserOpts: { trimBlocks: true } });
  });

  it("simple", () => {
    const tmpl = env.fromString(
      `
{% macro say_hello(name) %}Hello {{ name }}!{% endmacro %}
{{ say_hello('Peter') }}`.trim()
    );
    expect(tmpl.render()).toBe("Hello Peter!");
  });

  it("scoping", () => {
    const tmpl = env.fromString(
      `
{% macro level1(data1) %}
{% macro level2(data2) %}{{ data1 }}|{{ data2 }}{% endmacro %}
{{ level2('bar') }}{% endmacro %}
{{ level1('foo') }}
    `.trim()
    );
    expect(tmpl.render()).toBe("foo|bar");
  });

  it("arguments", () => {
    const tmpl = env.fromString(
      `
{% macro m(a, b, c='c', d='d') %}{{ a }}|{{ b }}|{{ c }}|{{ d }}{% endmacro %}
{{ m() }}|{{ m('a') }}|{{ m('a', 'b') }}|{{ m(1, 2, 3) }}
    `.trim()
    );
    expect(tmpl.render()).toBe("||c|d|a||c|d|a|b|c|d|1|2|3|d");
  });

  it("varargs", () => {
    const tmpl = env.fromString(
      `
{% macro test() %}{{ varargs|join('|') }}{% endmacro %}
{{ test(1, 2, 3) }}
    `.trim()
    );
    expect(tmpl.render()).toBe("1|2|3");
  });

  it("arguments defaults nonsense", () => {
    expect(() =>
      env.fromString(
        "{% macro m(a, b=1, c) %}a={{ a }}, b={{ b }}, c={{ c }}{% endmacro %}"
      )
    ).toThrow(TemplateSyntaxError);
  });

  it("caller defaults nonsense", () => {
    expect(() =>
      env.fromString(
        "{% macro a() %}{{ caller() }}{% endmacro %}{% call(x, y=1, z) a() %}{% endcall %}"
      )
    ).toThrow(TemplateSyntaxError);
  });

  it("simple call", () => {
    const tmpl = env.fromString(`
      {%- macro test() %}[[{{ caller() }}]]{% endmacro -%}
      {%- call test() %}data{% endcall -%}
    `);
    expect(tmpl.render()).toBe("[[data]]");
  });

  it("complex call", () => {
    const tmpl = env.fromString(`
      {%- macro test() %}[[{{ caller('data') }}]]{% endmacro -%}
      {% call(data) test() %}{{ data }}{% endcall -%}
    `);
    expect(tmpl.render()).toBe("[[data]]");
  });

  it.skip("caller undefined", () => {
    const tmpl = env.fromString(`
      {%- set caller = 42 -%}
      {%- macro test() %}{{ caller is not defined }}{% endmacro -%}
      {{- test() -}}
  `);
    expect(tmpl.render()).toBe("true");
  });

  it("include", () => {
    env = new Environment({
      async: false,
      loaders: [
        new ObjectSourceLoader({
          include: "{% macro test(foo) %}[{{ foo }}]{% endmacro %}",
        }),
      ],
    });
    const tmpl = env.fromString(
      '{% from "include" import test %}{{ test("foo") }}'
    );
    expect(tmpl.render()).toBe("[foo]");
  });

  it("macro api", () => {
    const tmpl = env.fromString(
      [
        "{% macro foo(a, b) %}{% endmacro %}",
        "{% macro bar() %}{{ varargs }}{{ kwargs }}{% endmacro %}",
        "{% macro baz() %}{{ caller() }}{% endmacro %}",
      ].join("")
    );
    expect((tmpl.module as any).foo.args).toStrictEqual(["a", "b"]);
    expect((tmpl.module as any).foo.name).toBe("foo");
    expect((tmpl.module as any).bar.args).toStrictEqual([]);
    expect((tmpl.module as any).bar.name).toBe("bar");
  });

  it("call self", () => {
    const tmpl = env.fromString(
      [
        "{% macro foo(x) %}{{ x }}{% if x > 1 %}|",
        "{{ foo(x - 1) }}{% endif %}{% endmacro %}",
        "{{ foo(5) }}",
      ].join("")
    );
    expect(tmpl.render()).toBe("5|4|3|2|1");
  });

  it("defaults self ref", () => {
    const tmpl = env.fromString(`
      {%- set x = 42 %}
      {%- macro m(a, b=x, x=23) %}{{ a }}|{{ b }}|{{ x }}{% endmacro -%}
    `);
    expect((tmpl.module as any).m(1)).toBe("1||23");
    expect((tmpl.module as any).m(1, 2)).toBe("1|2|23");
    expect((tmpl.module as any).m(1, 2, 3)).toBe("1|2|3");
    expect((tmpl.module as any).m(1, { x: 7, __isKwargs: true })).toBe("1|7|7");
  });
});

describe("set", () => {
  let env: Environment<false>;

  beforeEach(() => {
    env = new Environment({ parserOpts: { trimBlocks: true } });
  });
  it("normal", () => {
    const tmpl = env.fromString("{% set foo = 1 %}{{ foo }}");
    expect(tmpl.render()).toBe("1");
    expect((tmpl.module as any).foo).toBe(1);
  });

  it("block", () => {
    const tmpl = env.fromString("{% set foo %}42{% endset %}{{ foo }}");
    expect(tmpl.render()).toBe("42");
    expect((tmpl.module as any).foo).toBe("42");
  });

  it("block escaping", () => {
    env.autoescape = true;
    const tmpl = env.fromString(
      "{% set foo %}<em>{{ test }}</em>{% endset %}foo: {{ foo }}"
    );
    expect(tmpl.render({ test: "<unsafe>" })).toBe(
      "foo: <em>&lt;unsafe&gt;</em>"
    );
  });

  it("namespace", () => {
    const tmpl = env.fromString(
      "{% set ns = namespace() %}{% set ns.bar = '42' %}{{ ns.bar }}"
    );
    expect(tmpl.render()).toBe("42");
  });

  it("namespace block", () => {
    const tmpl = env.fromString(
      "{% set ns = namespace() %}{% set ns.bar %}42{% endset %}{{ ns.bar }}"
    );
    expect(tmpl.render()).toBe("42");
  });

  it("initialized namespace", () => {
    const tmpl = env.fromString(
      [
        "{% set ns = namespace(d, self=37) %}",
        "{% set ns.b = 42 %}",
        "{{ ns.a }}|{{ ns.self }}|{{ ns.b }}",
      ].join("")
    );
    expect(tmpl.render({ d: { a: 13 } })).toBe("13|37|42");
  });

  it("namespace loop", () => {
    const tmpl = env.fromString(
      [
        "{% set ns = namespace(found=false) %}",
        "{% for x in range(4) %}",
        "{% if x == v %}",
        "{% set ns.found = true %}",
        "{% endif %}",
        "{% endfor %}",
        "{{ ns.found }}",
      ].join("")
    );
    expect(tmpl.render({ v: 3 })).toBe("true");
    expect(tmpl.render({ v: 4 })).toBe("false");
  });

  it("namespace macro", () => {
    const tmpl = env.fromString(
      [
        "{% set ns = namespace() %}",
        "{% set ns.a = 13 %}",
        "{% macro magic(x) %}",
        "{% set x.b = 37 %}",
        "{% endmacro %}",
        "{{ magic(ns) }}",
        "{{ ns.a }}|{{ ns.b }}",
      ].join("")
    );
    expect(tmpl.render()).toBe("13|37");
  });

  it("block escaping filter", () => {
    env.autoescape = true;
    const tmpl = env.fromString(
      "{% set foo | trim %}<em>{{ test }}</em>    {% endset %}foo: {{ foo }}"
    );
    expect(tmpl.render({ test: "<unsafe>" })).toBe(
      "foo: <em>&lt;unsafe&gt;</em>"
    );
  });

  it("block filtered", () => {
    const tmpl = env.fromString(
      "{% set foo | trim | length | string %} 42    {% endset %}{{ foo }}"
    );
    expect(tmpl.render()).toBe("2");
    expect((tmpl.module as any).foo).toBe("2");
  });

  it("block filtered set", () => {
    env.filters.myfilter = (val: unknown, arg: unknown) => {
      expect(arg).toBe(" xxx ");
      return val;
    };
    const tmpl = env.fromString(
      [
        '{% set a = " xxx " %}',
        "{% set foo | myfilter(a) | trim | length | string %}",
        ' {% set b = " yy " %} 42 {{ a }}{{ b }}   ',
        "{% endset %}",
        "{{ foo }}",
      ].join("")
    );
    expect(tmpl.render()).toBe("11");
    expect((tmpl.module as any).foo).toBe("11");
  });
});

describe("with", () => {
  it("basic", () => {
    const env = new Environment({ async: false });
    const tmpl = env.fromString(`
      {%- with a=42, b=23 -%}
        {{ a }} = {{ b }}
      {% endwith -%}
        {{ a }} = {{ b }}
    `);
    const lines = tmpl
      .render({ a: 1, b: 2 })
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => !!l);
    expect(lines).toStrictEqual(["42 = 23", "1 = 2"]);
  });

  it("argument scoping", () => {
    const env = new Environment({ async: false });
    const tmpl = env.fromString(`
      {%- with a=1, b=2, c=b, d=e, e=5 -%}
      {{ a }}|{{ b }}|{{ c }}|{{ d }}|{{ e }}
      {%- endwith -%}
    `);
    expect(tmpl.render({ b: 3, e: 4 })).toBe("1|2|3|4|5");
  });
});
