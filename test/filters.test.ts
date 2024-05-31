import { Environment, ObjectSourceLoader } from "@nunjucks/environment";
import { TemplateRuntimeError } from "@nunjucks/runtime";
import { describe, expect, test } from "@jest/globals";
import { TemplateSyntaxError } from "@nunjucks/parser";

class Magic {
  value: any;
  constructor(value: any) {
    this.value = value;
  }
  toString() {
    return `${this.value}`;
  }
}

class Magic2 {
  value1: any;
  value2: any;
  constructor(value1: any, value2: any) {
    this.value1 = value1;
    this.value2 = value2;
  }
  toString() {
    return `${this.value1},${this.value2}`;
  }
}

describe("filters", () => {
  let env: Environment<false>;

  beforeEach(() => {
    env = new Environment();
  });

  it("capitalize", () => {
    const tmpl = env.fromString('{{ "foo bar"|capitalize }}');
    expect(tmpl.render()).toBe("Foo bar");
  });

  it("center", () => {
    const tmpl = env.fromString('{{ "foo"|center(9) }}');
    expect(tmpl.render()).toBe("   foo   ");
  });
  it.skip("default", () => {
    const tmpl = env.fromString(
      [
        "{{ missing|default('no') }}|{{ false|default('no') }}|",
        "{{ false|default('no', true) }}|{{ given|default('no') }}",
      ].join("")
    );
    expect(tmpl.render({ given: "yes" })).toBe("no|False|no|yes");
  });

  it.each`
    args              | expected
    ${""}             | ${"[['aa', 0], ['AB', 3], ['b', 1], ['c', 2]]"}
    ${"true"}         | ${"[['AB', 3], ['aa', 0], ['b', 1], ['c', 2]]"}
    ${'by="value"'}   | ${"[['aa', 0], ['b', 1], ['c', 2], ['AB', 3]]"}
    ${"reverse=true"} | ${"[['c', 2], ['b', 1], ['AB', 3], ['aa', 0]]"}
  `(
    "dictsort returns expected value with args '$args'",
    ({ args, expected }) => {
      const tmpl = env.fromString(`{{ foo|dictsort(${args})}}`);
      expect(tmpl.render({ foo: { aa: 0, b: 1, c: 2, AB: 3 } })).toBe(expected);
    }
  );

  describe("indent", () => {
    it.each`
      first    | blank    | expected
      ${false} | ${false} | ${'\n  foo bar\n  "baz"\n'}
      ${false} | ${true}  | ${'\n  foo bar\n  "baz"\n  '}
      ${true}  | ${false} | ${'  \n  foo bar\n  "baz"\n'}
      ${true}  | ${true}  | ${'  \n  foo bar\n  "baz"\n  '}
    `("first=$first, blank=$blank", ({ first, blank, expected }) => {
      const text = ["", "foo bar", '"baz"', ""].join("\n");
      const tmpl = env.fromString(`{{ foo|indent(2, ${first}, ${blank}) }}`);
      expect(tmpl.render({ foo: text })).toBe(expected);
    });
  });

  it("batch", () => {
    const tmpl = env.fromString(
      "{{ foo|batch(3)|list }}|{{ foo|batch(3, 'X')|list }}"
    );
    expect(tmpl.render({ foo: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] })).toBe(
      [
        "[[0, 1, 2], [3, 4, 5], [6, 7, 8], [9]]",
        "[[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 'X', 'X']]",
      ].join("|")
    );
  });

  it("slice", () => {
    const tmpl = env.fromString(
      "{{ foo|slice(3)|list }}|{{ foo|slice(3, 'X')|list }}"
    );
    expect(tmpl.render({ foo: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] })).toBe(
      [
        "[[0, 1, 2, 3], [4, 5, 6], [7, 8, 9]]",
        "[[0, 1, 2, 3], [4, 5, 6, 'X'], [7, 8, 9, 'X']]",
      ].join("|")
    );
  });

  it("escape", () => {
    const tmpl = env.fromString(`{{ '<">&'|escape }}`);
    expect(tmpl.render()).toBe("&lt;&#34;&gt;&amp;");
  });

  describe.skip("trim", () => {
    it.each`
      args      | expected
      ${""}     | ${"..stays.."}
      ${'"."'}  | ${"  ..stays"}
      ${'" ."'} | ${"stays"}
    `("trim($args)", ({ args, expected }) => {
      const tmpl = env.fromString(`{{ foo|trim(${args}) }}`);
      expect(tmpl.render({ foo: "  ..stays.." })).toBe(expected);
    });
  });

  it.skip("striptags", () => {
    const tmpl = env.fromString("{{ foo|striptags }}");
    const foo = [
      '  <p>just a small   \n <a href="#">',
      "example</a> link</p>\n<p>to a webpage</p> ",
      "<!-- <p>and some commented stuff</p> -->",
    ].join("");
    expect(tmpl.render({ foo })).toBe("just a small example link to a webpage");
  });

  it.skip("filesizeformat", () => {
    const tmpl = env.fromString(
      [
        "{{ 100|filesizeformat }}",
        "{{ 1000|filesizeformat }}",
        "{{ 1000000|filesizeformat }}",
        "{{ 1000000000|filesizeformat }}",
        "{{ 1000000000000|filesizeformat }}",
        "{{ 100|filesizeformat(true) }}",
        "{{ 1000|filesizeformat(true) }}",
        "{{ 1000000|filesizeformat(true) }}",
        "{{ 1000000000|filesizeformat(true) }}",
        "{{ 1000000000000|filesizeformat(true) }}",
      ].join("|")
    );
    expect(tmpl.render().split("|")).toStrictEqual([
      "100 Bytes",
      "1.0 kB",
      "1.0 MB",
      "1.0 GB",
      "1.0 TB",
      "100 Bytes",
      "1000 Bytes",
      "976.6 KiB",
      "953.7 MiB",
      "931.3 GiB",
    ]);
  });

  it("first", () => {
    const tmpl = env.fromString("{{ foo | first }}");
    expect(tmpl.render({ foo: [0, 1, 2, 3] })).toBe("0");
  });

  describe.skip("float", () => {
    it.each`
      value      | expected
      ${"42"}    | ${"42.0"}
      ${"abc"}   | ${"0.0"}
      ${"32.32"} | ${"32.32"}
    `('"$value"|float', ({ value, expected }) => {
      const tmpl = env.fromString("{{ value | float }}");
      expect(tmpl.render({ value })).toBe(expected);
    });
  });

  it.skip("float default", () => {
    const tmpl = env.fromString("{{ value|float(default=1.0) }}");
    expect(tmpl.render({ value: "abc" })).toBe("1.0");
  });

  it.skip("format", () => {
    const tmpl = env.fromString("{{ '%s|%s'|format('a', 'b') }}");
    expect(tmpl.render()).toBe("a|b");
  });

  describe.skip("int", () => {
    it.each`
      value                     | expected
      ${"42"}                   | ${"42"}
      ${"abc"}                  | ${"0"}
      ${"32.32"}                | ${"32"}
      ${"12345678901234567890"} | ${"12345678901234567890"}
    `("$value", ({ value, expected }) => {
      const tmpl = env.fromString("{{ value | int }}");
      expect(tmpl.render({ value })).toBe(expected);
    });

    it.each`
      value       | base  | expected
      ${"0x4d32"} | ${16} | ${"19762"}
      ${"011"}    | ${8}  | ${"9"}
      ${"0x33Z"}  | ${16} | ${"0"}
    `("$value|int(base=$base)", ({ value, base, expected }) => {
      const tmpl = env.fromString("{{ value | int(base=base) }}");
      expect(tmpl.render({ value, base })).toBe(expected);
    });

    it("default", () => {
      const tmpl = env.fromString("{{ value | int(default=1) }}");
      expect(tmpl.render({ value: "abc" })).toBe("1");
    });
  });

  describe("join", () => {
    it("basic", () => {
      const tmpl = env.fromString('{{ [1, 2, 3]|join("|") }}');
      expect(tmpl.render()).toBe("1|2|3");
    });
    it("autoescape", () => {
      env.autoescape = true;
      const tmpl = env.fromString(
        '{{ ["<foo>", "<span>foo</span>"|safe]|join }}'
      );
      expect(tmpl.render()).toBe("&lt;foo&gt;<span>foo</span>");
    });
    it("attribute", () => {
      const users = [{ username: "foo" }, { username: "bar" }];
      const tmpl = env.fromString("{{ users | join(', ', 'username') }}");
      expect(tmpl.render({ users })).toBe("foo, bar");
    });
  });

  it("last", () => {
    const tmpl = env.fromString("{{ foo | last }}");
    expect(tmpl.render({ foo: [0, 1, 2, 3] })).toBe("3");
  });

  it("length", () => {
    const tmpl = env.fromString('{{ "hello world" | length }}');
    expect(tmpl.render()).toBe("11");
  });

  it("lower", () => {
    const tmpl = env.fromString('{{ "FOO" | lower }}');
    expect(tmpl.render()).toBe("foo");
  });

  it("items", () => {
    const d = { a: "x", b: "y", c: "z" };
    const tmpl = env.fromString("{{ d | items | list }}");
    expect(tmpl.render({ d })).toBe("[['a', 'x'], ['b', 'y'], ['c', 'z']]");
  });

  it("items undefined", () => {
    const tmpl = env.fromString("{{ d | items | list }}");
    expect(tmpl.render()).toBe("[]");
  });

  it.skip("pprint", () => {
    // TODO: do we even try to retain this?
  });

  it.skip("random", () => {
    // TODO
  });

  it("reverse", () => {
    const tmpl = env.fromString(
      "{{ 'foobar'|reverse|join }}|{{ [1, 2, 3]|reverse|list }}"
    );
    expect(tmpl.render()).toBe("raboof|[3, 2, 1]");
  });

  it("string", () => {
    const obj = [1, 2, 3, 4, 5];
    const tmpl = env.fromString("{{ obj | string }}");
    expect(tmpl.render({ obj })).toBe("[1, 2, 3, 4, 5]");
  });

  it.skip("title", () => {
    let tmpl;
    tmpl = env.fromString(`{{ "foo bar"|title }}`);
    expect(tmpl.render()).toBe("Foo Bar");
    tmpl = env.fromString(`{{ "foo's bar"|title }}`);
    expect(tmpl.render()).toBe("Foo's Bar");
    tmpl = env.fromString(`{{ "foo   bar"|title }}`);
    expect(tmpl.render()).toBe("Foo   Bar");
    tmpl = env.fromString(`{{ "f bar f"|title }}`);
    expect(tmpl.render()).toBe("F Bar F");
    tmpl = env.fromString(`{{ "foo-bar"|title }}`);
    expect(tmpl.render()).toBe("Foo-Bar");
    tmpl = env.fromString(`{{ "foo\tbar"|title }}`);
    expect(tmpl.render()).toBe("Foo\tBar");
    tmpl = env.fromString(`{{ "FOO\tBAR"|title }}`);
    expect(tmpl.render()).toBe("Foo\tBar");
    tmpl = env.fromString(`{{ "foo (bar)"|title }}`);
    expect(tmpl.render()).toBe("Foo (Bar)");
    tmpl = env.fromString(`{{ "foo {bar}"|title }}`);
    expect(tmpl.render()).toBe("Foo {Bar}");
    tmpl = env.fromString(`{{ "foo [bar]"|title }}`);
    expect(tmpl.render()).toBe("Foo [Bar]");
    tmpl = env.fromString(`{{ "foo <bar>"|title }}`);
    expect(tmpl.render()).toBe("Foo <Bar>");
  });

  describe.skip("truncate", () => {
    const data = "foobar baz bar".repeat(1000);

    it("basic", () => {
      const tmpl = env.fromString("{{ data | truncate(15) }}");
      expect(tmpl.render({ data })).toBe("foobar baz b...");
    });

    it("end", () => {
      const tmpl = env.fromString("{{ data | truncate(15, end='>>>') }}");
      expect(tmpl.render({ data })).toBe("foobar baz b>>>");
    });

    it("killwords", () => {
      const tmpl = env.fromString("{{ data | truncate(15, true, '>>>') }}");
      expect(tmpl.render({ data })).toBe("foobar baz>>>");
    });
    it("short string", () => {
      const tmpl = env.fromString(
        '{{ "foo bar baz"|truncate(9) }}|{{ "foo bar baz"|truncate(9, true) }}'
      );
      expect(tmpl.render()).toBe("foo bar baz|foo bar baz");
    });
  });

  it("upper", () => {
    const tmpl = env.fromString('{{ "foo" | upper }}');
    expect(tmpl.render()).toBe("FOO");
  });

  describe.skip("urlize", () => {
    it("basic", () => {
      let tmpl;
      tmpl = env.fromString('{{ "foo example.org bar"|urlize }}');
      expect(tmpl.render()).toBe(
        `foo <a href="https://example.org" rel="noopener">example.org</a> bar`
      );
      tmpl = env.fromString('{{ "foo http://www.example.com/ bar"|urlize }}');
      expect(tmpl.render()).toBe(
        [
          'foo <a href="http://www.example.com/" rel="noopener">',
          "http://www.example.com/</a> bar",
        ].join("")
      );
      tmpl = env.fromString('{{ "foo mailto:email@example.com bar"|urlize }}');
      expect(tmpl.render()).toBe(
        'foo <a href="mailto:email@example.com">email@example.com</a> bar'
      );
      tmpl = env.fromString('{{ "foo email@example.com bar"|urlize }}');
      expect(tmpl.render()).toBe(
        'foo <a href="mailto:email@example.com">email@example.com</a> bar'
      );
    });

    it("rel policy", () => {
      // env.policies["urlize.rel"] = null;
      const tmpl = env.fromString(
        '{{ "foo http://www.example.com/ bar"|urlize }}'
      );
      expect(tmpl.render()).toBe(
        'foo <a href="http://www.example.com/">http://www.example.com/</a> bar'
      );
    });

    it("target parameter", () => {
      const tmpl = env.fromString(
        '{{ "foo http://www.example.com/ bar"|urlize(target="_blank") }}'
      );
      expect(tmpl.render()).toBe(
        [
          "foo ",
          '<a href="http://www.example.com/" rel="noopener" target="_blank">',
          "http://www.example.com/</a> bar",
        ].join("")
      );
    });

    it("extra_schemes parameter", () => {
      const tmpl = env.fromString(
        [
          '{{ "foo tel:+1-514-555-1234 ftp://localhost bar"|',
          'urlize(extra_schemes=["tel:", "ftp:"]) }}',
        ].join("")
      );
      expect(tmpl.render()).toBe(
        [
          'foo <a href="tel:+1-514-555-1234" rel="noopener">',
          'tel:+1-514-555-1234</a> <a href="ftp://localhost" rel="noopener">',
          "ftp://localhost</a> bar",
        ].join("")
      );
    });
  });

  it("wordcount", () => {
    const tmpl = env.fromString('{{ "foo bar baz"|wordcount }}');
    expect(tmpl.render()).toBe("3");
    // TODO StrictUndefined
  });

  it("block syntax", () => {
    const tmpl = env.fromString(
      "{% filter lower|escape %}<HEHE>{% endfilter %}"
    );
    expect(tmpl.render()).toBe("&lt;hehe&gt;");
  });

  it("chaining", () => {
    const tmpl = env.fromString(`{{ ['<foo>', '<bar>']|first|upper|escape }}`);
    expect(tmpl.render()).toBe("&lt;FOO&gt;");
  });

  describe("sum", () => {
    it("basic", () => {
      const tmpl = env.fromString("{{ [1, 2, 3, 4, 5, 6]|sum }}");
      expect(tmpl.render()).toBe("21");
    });

    it("attributes", () => {
      const values = [{ value: 23 }, { value: 1 }, { value: 18 }];
      const tmpl = env.fromString("{{ values|sum('value') }}");
      expect(tmpl.render({ values })).toBe("42");
    });

    it("nested attributes", () => {
      const values = [
        { real: { value: 23 } },
        { real: { value: 1 } },
        { real: { value: 18 } },
      ];
      const tmpl = env.fromString("{{ values|sum('real.value') }}");
      expect(tmpl.render({ values })).toBe("42");
    });

    it("index", () => {
      const values = { foo: 23, bar: 1, baz: 18 };
      const tmpl = env.fromString("{{ values|items|sum('1') }}");
      expect(tmpl.render({ values })).toBe("42");
    });
  });

  it("abs", () => {
    const tmpl = env.fromString("{{ -1 | abs }}|{{ 1 | abs }}");
    expect(tmpl.render()).toBe("1|1");
  });

  it("round positive", () => {
    const tmpl = env.fromString(
      [
        "{{ 2.7|round }}|{{ 2.1|round }}",
        "{{ 2.1234|round(3, 'floor') }}",
        "{{ 2.1|round(0, 'ceil') }}",
      ].join("|")
    );
    expect(tmpl.render()).toBe("3|2|2.123|3");
  });

  it("round negative", () => {
    const tmpl = env.fromString(
      [
        "{{ 21.3|round(-1)}}",
        "{{ 21.3|round(-1, 'ceil')}}",
        "{{ 21.3|round(-1, 'floor')}}",
      ].join("|")
    );
    expect(tmpl.render()).toBe("20|30|20");
  });
});
