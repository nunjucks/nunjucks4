import { Environment } from "@nunjucks/environment";
import { markSafe, str } from "@nunjucks/runtime";
import { describe, expect } from "@jest/globals";

class Magic {
  value: any;
  constructor(value: any) {
    this.value = value;
  }
  toString() {
    return str(this.value);
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
    return `(${str(this.value1)},${str(this.value2)})`;
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
  it("default", () => {
    const tmpl = env.fromString(
      [
        "{{ missing|default('no') }}|{{ false|default('no') }}|",
        "{{ false|default('no', true) }}|{{ given|default('no') }}",
      ].join(""),
    );
    expect(tmpl.render({ given: "yes" })).toBe("no|false|no|yes");
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
    },
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
      "{{ foo|batch(3)|list }}|{{ foo|batch(3, 'X')|list }}",
    );
    expect(tmpl.render({ foo: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] })).toBe(
      [
        "[[0, 1, 2], [3, 4, 5], [6, 7, 8], [9]]",
        "[[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 'X', 'X']]",
      ].join("|"),
    );
  });

  it("slice", () => {
    const tmpl = env.fromString(
      "{{ foo|slice(3)|list }}|{{ foo|slice(3, 'X')|list }}",
    );
    expect(tmpl.render({ foo: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] })).toBe(
      [
        "[[0, 1, 2, 3], [4, 5, 6], [7, 8, 9]]",
        "[[0, 1, 2, 3], [4, 5, 6, 'X'], [7, 8, 9, 'X']]",
      ].join("|"),
    );
  });

  it("escape", () => {
    const tmpl = env.fromString(`{{ '<">&'|escape }}`);
    expect(tmpl.render()).toBe("&lt;&#34;&gt;&amp;");
  });

  describe("trim", () => {
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

  it("striptags", () => {
    const tmpl = env.fromString("{{ foo|striptags }}");
    const foo = [
      '  <p>just a small   \n <a href="#">',
      "example</a> link</p>\n<p>to a webpage</p> ",
      "<!-- <p>and some commented stuff</p> -->",
    ].join("");
    expect(tmpl.render({ foo })).toBe("just a small example link to a webpage");
  });

  it("filesizeformat", () => {
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
      ].join("|"),
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

  describe("float", () => {
    it.each`
      value      | expected
      ${"42"}    | ${"42.0"}
      ${"abc"}   | ${"0.0"}
      ${"32.32"} | ${"32.32"}
    `('"$value"|float', ({ value, expected }) => {
      const tmpl = env.fromString("{{ value | float }}");
      expect(tmpl.render({ value })).toBe(expected);
    });
    it("default argument", () => {
      const tmpl = env.fromString("{{ value|float(default=1.0) }}");
      expect(tmpl.render({ value: "abc" })).toBe("1.0");
    });
  });

  it("format", () => {
    let tmpl = env.fromString("{{ '%s|%s'|format('a', 'b') }}");
    expect(tmpl.render()).toBe("a|b");
    tmpl = env.fromString("{{ '%(a)s|%(b)s'|format(a='A', b='B') }}");
    expect(tmpl.render()).toBe("A|B");
  });

  describe("int", () => {
    // TODO handle int larger than Number.MAX_SAFE_INTEGER?
    // ${"12345678901234567890"} | ${"12345678901234567890"}
    it.each`
      value      | expected
      ${"42"}    | ${"42"}
      ${"abc"}   | ${"0"}
      ${"32.32"} | ${"32"}
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
        '{{ ["<foo>", "<span>foo</span>"|safe]|join }}',
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
      "{{ 'foobar'|reverse|join }}|{{ [1, 2, 3]|reverse|list }}",
    );
    expect(tmpl.render()).toBe("raboof|[3, 2, 1]");
  });

  it("string", () => {
    const obj = [1, 2, 3, 4, 5];
    const tmpl = env.fromString("{{ obj | string }}");
    expect(tmpl.render({ obj })).toBe("[1, 2, 3, 4, 5]");
  });

  it("title", () => {
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

  describe("truncate", () => {
    const data = "foobar baz bar".repeat(1000);

    it("basic", () => {
      const tmpl = env.fromString("{{ data | truncate(15) }}");
      expect(tmpl.render({ data })).toBe("foobar baz...");
    });

    it("end", () => {
      const tmpl = env.fromString("{{ data | truncate(15, end='>>>') }}");
      expect(tmpl.render({ data })).toBe("foobar baz>>>");
    });

    it("killwords", () => {
      const tmpl = env.fromString("{{ data | truncate(15, true, '>>>') }}");
      expect(tmpl.render({ data })).toBe("foobar baz b>>>");
    });
    it("short string", () => {
      const tmpl = env.fromString(
        '{{ "foo bar baz"|truncate(9) }}|{{ "foo bar baz"|truncate(9, true) }}',
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
        `foo <a href="https://example.org" rel="noopener">example.org</a> bar`,
      );
      tmpl = env.fromString('{{ "foo http://www.example.com/ bar"|urlize }}');
      expect(tmpl.render()).toBe(
        [
          'foo <a href="http://www.example.com/" rel="noopener">',
          "http://www.example.com/</a> bar",
        ].join(""),
      );
      tmpl = env.fromString('{{ "foo mailto:email@example.com bar"|urlize }}');
      expect(tmpl.render()).toBe(
        'foo <a href="mailto:email@example.com">email@example.com</a> bar',
      );
      tmpl = env.fromString('{{ "foo email@example.com bar"|urlize }}');
      expect(tmpl.render()).toBe(
        'foo <a href="mailto:email@example.com">email@example.com</a> bar',
      );
    });

    it("rel policy", () => {
      // env.policies["urlize.rel"] = null;
      const tmpl = env.fromString(
        '{{ "foo http://www.example.com/ bar"|urlize }}',
      );
      expect(tmpl.render()).toBe(
        'foo <a href="http://www.example.com/">http://www.example.com/</a> bar',
      );
    });

    it("target parameter", () => {
      const tmpl = env.fromString(
        '{{ "foo http://www.example.com/ bar"|urlize(target="_blank") }}',
      );
      expect(tmpl.render()).toBe(
        [
          "foo ",
          '<a href="http://www.example.com/" rel="noopener" target="_blank">',
          "http://www.example.com/</a> bar",
        ].join(""),
      );
    });

    it("extra_schemes parameter", () => {
      const tmpl = env.fromString(
        [
          '{{ "foo tel:+1-514-555-1234 ftp://localhost bar"|',
          'urlize(extra_schemes=["tel:", "ftp:"]) }}',
        ].join(""),
      );
      expect(tmpl.render()).toBe(
        [
          'foo <a href="tel:+1-514-555-1234" rel="noopener">',
          'tel:+1-514-555-1234</a> <a href="ftp://localhost" rel="noopener">',
          "ftp://localhost</a> bar",
        ].join(""),
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
      "{% filter lower|escape %}<HEHE>{% endfilter %}",
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
      ].join("|"),
    );
    expect(tmpl.render()).toBe("3|2|2.123|3");
  });

  it("round negative", () => {
    const tmpl = env.fromString(
      [
        "{{ 21.3|round(-1)}}",
        "{{ 21.3|round(-1, 'ceil')}}",
        "{{ 21.3|round(-1, 'floor')}}",
      ].join("|"),
    );
    expect(tmpl.render()).toBe("20|30|20");
  });

  it("xmlattr", () => {
    const tmpl = env.fromString(
      "{{ {'foo': 42, 'bar': 23, 'fish': none, " +
        "'spam': missing, 'blub:blub': '<?>'}|xmlattr }}",
    );
    const out = tmpl
      .render()
      .trim()
      .split(/[\n\s]+/g);
    expect(out).toStrictEqual([
      'foo="42"',
      'bar="23"',
      'blub:blub="&lt;?&gt;"',
    ]);
  });

  describe("sort", () => {
    it("sort1", () => {
      const tmpl = env.fromString(
        "{{ [2, 3, 1]|sort }}|{{ [2, 3, 1]|sort(true) }}",
      );
      expect(tmpl.render()).toBe("[1, 2, 3]|[3, 2, 1]");
    });
    it("sort2", () => {
      const tmpl = env.fromString('{{ ["c", "A", "b", "D"].join("")|sort }}');
      expect(tmpl.render()).toBe("AbcD");
    });
    it("sort3", () => {
      const tmpl = env.fromString(`{{ ['foo', 'Bar', 'blah']|sort }}`);
      expect(tmpl.render()).toBe("['Bar', 'blah', 'foo']");
    });
    it("sort4", () => {
      const tmpl = env.fromString(`{{ items|sort(attribute='value')|join }}`);
      const items = [3, 2, 4, 1].map((v) => new Magic(v));
      expect(tmpl.render({ items })).toBe("1234");
    });
    it("sort5", () => {
      const tmpl = env.fromString(`{{ items|sort(attribute='value.0')|join }}`);
      const items = [[3], [2], [4], [1]].map((v) => new Magic(v));
      expect(tmpl.render({ items })).toBe("[1][2][3][4]");
    });
    it("sort6", () => {
      const tmpl = env.fromString(
        `{{ items|sort(attribute='value1,value2')|join }}`,
      );
      const items = [
        [3, 1],
        [2, 2],
        [2, 1],
        [2, 5],
      ].map(([x, y]) => new Magic2(x, y));
      expect(tmpl.render({ items })).toBe("(2,1)(2,2)(2,5)(3,1)");
    });
    it("sort7", () => {
      const tmpl = env.fromString(
        `{{ items|sort(attribute='value2,value1')|join }}`,
      );
      const items = [
        [3, 1],
        [2, 2],
        [2, 1],
        [2, 5],
      ].map(([x, y]) => new Magic2(x, y));
      expect(
        tmpl.render({
          items,
        }),
      ).toBe("(2,1)(3,1)(2,2)(2,5)");
    });
    it("sort8", () => {
      const tmpl = env.fromString(
        `{{ items|sort(attribute='value1.0,value2.0')|join }}`,
      );
      const items = [
        [[3], [1]],
        [[2], [2]],
        [[2], [1]],
        [[2], [5]],
      ].map(([x, y]) => new Magic2(x, y));
      expect(
        tmpl.render({
          items,
        }),
      ).toBe("([2],[1])([2],[2])([2],[5])([3],[1])");
    });
  });

  describe("unique", () => {
    it("basic", () => {
      const tmpl = env.fromString('{{ ["b", "A", "a", "b"]|unique|join }}');
      expect(tmpl.render()).toBe("bA");
    });

    it("case sensitive", () => {
      const tmpl = env.fromString('{{ "bAab"|unique(true)|join }}');
      expect(tmpl.render()).toBe("bAa");
    });

    it("attribute", () => {
      const items = [3, 2, 4, 1, 2].map((val) => new Magic(val));
      const tmpl = env.fromString("{{ items|unique(attribute='value')|join }}");
      expect(tmpl.render({ items })).toBe("3241");
    });
  });

  describe("min", () => {
    it("basic", () => {
      const tmpl = env.fromString('{{ ["a", "B"]|min }}');
      expect(tmpl.render()).toBe("a");
    });
    it("case sensitive", () => {
      const tmpl = env.fromString('{{ ["a", "B"]|min(case_sensitive=true) }}');
      expect(tmpl.render()).toBe("B");
    });
    it("empty", () => {
      const tmpl = env.fromString("{{ []|min }}");
      expect(tmpl.render()).toBe("");
    });
    it("attribute", () => {
      const items = [5, 1, 9].map((val) => new Magic(val));
      const tmpl = env.fromString('{{ items | min(attribute="value") }}');
      expect(tmpl.render({ items })).toBe("1");
    });
  });

  describe("max", () => {
    it("basic", () => {
      const tmpl = env.fromString('{{ ["a", "B"]|max }}');
      expect(tmpl.render()).toBe("B");
    });
    it("case sensitive", () => {
      const tmpl = env.fromString('{{ ["a", "B"]|max(case_sensitive=true) }}');
      expect(tmpl.render()).toBe("a");
    });
    it("empty", () => {
      const tmpl = env.fromString("{{ []|max }}");
      expect(tmpl.render()).toBe("");
    });
    it("attribute", () => {
      const items = [5, 1, 9].map((val) => new Magic(val));
      const tmpl = env.fromString('{{ items | max(attribute="value") }}');
      expect(tmpl.render({ items })).toBe("9");
    });
  });

  describe.skip("groupby", () => {
    it("basic", () => {
      const tmpl = env.fromString(`
        {%- for grouper, list in [{'foo': 1, 'bar': 2},
                                  {'foo': 2, 'bar': 3},
                                  {'foo': 1, 'bar': 1},
                                  {'foo': 3, 'bar': 4}]|groupby('foo') -%}
          {{ grouper }}
          {%- for x in list %}: {{ x.foo }}, {{ x.bar }}{% endfor %}|
        {%- endfor -%}
      `);
      expect(tmpl.render().split("|")).toStrictEqual([
        "1: 1, 2: 1, 1",
        "2: 2, 3",
        "3: 3, 4",
        "",
      ]);
    });

    it("index", () => {
      const tmpl = env.fromString(`
    {%- for grouper, list in [('a', 1), ('a', 2), ('b', 1)]|groupby(0) -%}
        {{ grouper }}{% for x in list %}:{{ x.1 }}{% endfor %}|
    {%- endfor -%}
    `);
      expect(tmpl.render()).toBe("a:1:2|b:1|");
    });

    it("multidot", () => {
      class Date_ {
        constructor(
          public day: number,
          public month: number,
          public year: number,
        ) {}
      }
      class Article {
        constructor(
          public title: string,
          public date: Date_,
        ) {}
      }

      const articles = [
        new Article("aha", new Date_(1, 1, 1970)),
        new Article("interesting", new Date_(2, 1, 1970)),
        new Article("really?", new Date_(3, 1, 1970)),
        new Article("totally not", new Date_(1, 1, 1971)),
      ];

      const tmpl = env.fromString(`
        {%- for year, list in articles|groupby('date.year') -%}
          {{ year }}{% for x in list %}[{{ x.title }}]{% endfor %}|
        {%- endfor %}`);
      expect(tmpl.render({ articles }).split("|")).toStrictEqual([
        "1970[aha][interesting][really?]",
        "1971[totally not]",
        "",
      ]);
    });

    it("default", () => {
      const tmpl = env.fromString(
        [
          "{% for city, items in users|groupby('city', default='NY') %}",
          "{{ city }}: {{ items|map(attribute='name')|join(', ') }}\n",
          "{% endfor %}",
        ].join(""),
      );
      expect(
        tmpl.render({
          users: [
            { name: "emma", city: "NY" },
            { name: "smith", city: "WA" },
            { name: "john" },
          ],
        }),
      ).toBe("NY: emma, john\nWA: smith\n");
    });

    it.each([
      [false, "a: 1, 3\nb: 2\n"],
      [true, "A: 3\na: 1\nb: 2\n"],
    ])("case_sensitive=%s", (cs, expected) => {
      const tmpl = env.fromString(
        [
          "{% for k, vs in data|groupby('k', case_sensitive=cs) %}",
          "{{ k }}: {{ vs|join(', ', attribute='v') }}\n",
          "{% endfor %}",
        ].join(""),
      );
      expect(
        tmpl.render({
          data: [
            { k: "a", v: 1 },
            { k: "b", v: 2 },
            { k: "A", v: 3 },
          ],
          cs,
        }),
      ).toBe(expected);
    });
  });

  it("filter tag", () => {
    const tmpl = env.fromString(
      "{% filter upper|replace('FOO', 'foo') %}foobar{% endfilter %}",
    );
    expect(tmpl.render()).toBe("fooBAR");
  });

  it("replace", () => {
    let tmpl;
    tmpl = env.fromString('{{ string|replace("o", 42) }}');
    expect(tmpl.render({ string: "<foo>" })).toBe("<f4242>");
    env.autoescape = true;
    tmpl = env.fromString('{{ string|replace("o", 42) }}');
    expect(tmpl.render({ string: "<foo>" })).toBe("&lt;f4242&gt;");
    tmpl = env.fromString('{{ string|replace("<", 42) }}');
    expect(tmpl.render({ string: "<foo>" })).toBe("42foo&gt;");
    tmpl = env.fromString('{{ string|replace("o", ">x<") }}');
    expect(tmpl.render({ string: markSafe("foo") })).toBe(
      "f&gt;x&lt;&gt;x&lt;",
    );
  });

  it("forceescape", () => {
    const tmpl = env.fromString("{{ x|forceescape }}");
    expect(tmpl.render({ x: markSafe("<div />") })).toBe("&lt;div /&gt;");
  });

  it("safe", () => {
    env.autoescape = true;
    let tmpl;
    tmpl = env.fromString('{{ "<div>foo</div>"|safe }}');
    expect(tmpl.render()).toBe("<div>foo</div>");
    tmpl = env.fromString('{{ "<div>foo</div>" }}');
    expect(tmpl.render()).toBe("&lt;div&gt;foo&lt;/div&gt;");
  });

  it("urlencode", () => {
    env.autoescape = true;
    const tmpl = env.fromString("{{ value | urlencode }}");
    const values = [
      ["Hello, world!", "Hello%2C%20world%21"],
      ["Hello, world\u203d", "Hello%2C%20world%E2%80%BD"],
      [{ f: 1 }, "f=1"],
      [
        [
          ["f", 1],
          ["z", 2],
        ],
        "f=1&amp;z=2",
      ],
      [{ "\u203d": 1 }, "%E2%80%BD=1"],
      [{ 0: 1 }, "0=1"],
      [[["a b/c", "a b/c"]], "a+b%2Fc=a+b%2Fc"],
      ["a b/c", "a%20b/c"],
    ];
    const results = values.map(([value]) => [value, tmpl.render({ value })]);
    expect(values).toStrictEqual(results);
  });

  describe("map", () => {
    it("simple", () => {
      const tmpl = env.fromString('{{ ["1", "2", "3"]|map("int")|sum }}');
      expect(tmpl.render()).toBe("6");
    });

    it("sum", () => {
      const tmpl = env.fromString(
        '{{ [[1,2], [3], [4,5,6]]|map("sum")|list }}',
      );
      expect(tmpl.render()).toBe("[3, 3, 15]");
    });

    it("attribute", () => {
      const users = ["john", "jane", "mike"].map((name) => ({ name }));
      const tmpl = env.fromString(
        '{{ users|map(attribute="name")|join("|") }}',
      );
      expect(tmpl.render({ users })).toBe("john|jane|mike");
    });

    it("empty", () => {
      const tmpl = env.fromString('{{ none|map("upper")|list }}');
      expect(tmpl.render()).toBe("[]");
    });

    it("default", () => {
      class Fullname {
        constructor(
          public firstname: string,
          public lastname: string | null,
        ) {}
      }
      class Firstname {
        constructor(public firstname: string) {}
      }
      const users = [
        new Fullname("john", "lennon"),
        new Fullname("jane", "edwards"),
        new Fullname("jon", null),
        new Firstname("mike"),
      ];

      const tmpl = env.fromString(
        '{{ users|map(attribute="lastname", default="smith")|join(", ") }}',
      );
      const test_list = env.fromString(
        '{{ users|map(attribute="lastname", default=["smith","x"])|join(", ") }}',
      );
      const test_str = env.fromString(
        '{{ users|map(attribute="lastname", default="")|join(", ") }}',
      );

      expect(tmpl.render({ users })).toBe("lennon, edwards, null, smith");
      expect(test_list.render({ users })).toBe(
        "lennon, edwards, null, ['smith', 'x']",
      );
      expect(test_str.render({ users })).toBe("lennon, edwards, null, ");
    });
  });

  describe("select", () => {
    it("simple", () => {
      const tmpl = env.fromString(
        '{{ [1, 2, 3, 4, 5]|select("odd")|join("|") }}',
      );
      expect(tmpl.render()).toBe("1|3|5");
    });

    it("bool", () => {
      const tmpl = env.fromString(
        '{{ [none, false, 0, 1, 2, 3, 4, 5]|select|join("|") }}',
      );
      expect(tmpl.render()).toBe("1|2|3|4|5");
    });
  });

  describe("reject", () => {
    it("simple", () => {
      const tmpl = env.fromString(
        '{{ [1, 2, 3, 4, 5]|reject("odd")|join("|") }}',
      );
      expect(tmpl.render()).toBe("2|4");
    });

    it("bool", () => {
      const tmpl = env.fromString(
        '{{ [null, false, 0, 1, 2, 3, 4, 5]|reject|join("|") }}',
      );
      expect(tmpl.render()).toBe("null|false|0");
    });
  });

  describe("selectattr", () => {
    it("simple", () => {
      class User {
        constructor(
          public name: string,
          public isActive: boolean,
        ) {}
      }
      const users = [
        new User("john", true),
        new User("jane", true),
        new User("mike", false),
      ];
      const tmpl = env.fromString(
        '{{ users|selectattr("isActive")|map(attribute="name")|join("|") }}',
      );
      expect(tmpl.render({ users })).toBe("john|jane");
    });

    it("function", () => {
      class User {
        constructor(
          public id: number,
          public name: string,
        ) {}
      }
      const users = [
        new User(1, "john"),
        new User(2, "jane"),
        new User(3, "mike"),
      ];
      const tmpl = env.fromString(
        '{{ users|selectattr("id", "odd")|map(attribute="name")|join("|") }}',
      );
      expect(tmpl.render({ users })).toBe("john|mike");
    });
  });

  describe("rejectattr", () => {
    it("simple", () => {
      class User {
        constructor(
          public name: string,
          public isActive: boolean,
        ) {}
      }
      const users = [
        new User("john", true),
        new User("jane", true),
        new User("mike", false),
      ];
      const tmpl = env.fromString(
        '{{ users|rejectattr("isActive")|map(attribute="name")|join("|") }}',
      );
      expect(tmpl.render({ users })).toBe("mike");
    });

    it("function", () => {
      class User {
        constructor(
          public id: number,
          public name: string,
        ) {}
      }
      const users = [
        new User(1, "john"),
        new User(2, "jane"),
        new User(3, "mike"),
      ];
      const tmpl = env.fromString(
        '{{ users|rejectattr("id", "odd")|map(attribute="name")|join("|") }}',
      );
      expect(tmpl.render({ users })).toBe("jane");
    });
  });

  describe("tojson", () => {
    it("primitive value", () => {
      const tmpl = env.fromString("{{ x | tojson }}");
      expect(tmpl.render({ x: "string" })).toBe('"string"');
      expect(tmpl.render({ x: 0 })).toBe("0");
      expect(tmpl.render({ x: -1 })).toBe("-1");
      expect(tmpl.render({ x: -1 })).toBe("-1");
      expect(tmpl.render({ x: true })).toBe("true");
      expect(tmpl.render({ x: false })).toBe("false");
      expect(tmpl.render({ x: null })).toBe("null");
      expect(tmpl.render({ x: undefined })).toBe("undefined");
      expect(tmpl.render({ x: BigInt("9007199254740991") })).toBe(
        '"9007199254740991"',
      );
      expect(tmpl.render({ x: Symbol("symbol") })).toBe('"Symbol(symbol)"');
    });

    it("object value", () => {
      const tmpl = env.fromString("{{ x | tojson }}");
      expect(tmpl.render({ x: { foo: "bar" } })).toBe('{"foo":"bar"}');
      expect(tmpl.render({ x: ["foo", "bar"] })).toBe('["foo","bar"]');
      expect(tmpl.render({ x: /\b/ })).toBe("{}");
      expect(tmpl.render({ x: new Error("<error />") })).toBe("{}");
      expect(tmpl.render({ x: new Date("2021-02-28T23:15:00.000Z") })).toBe(
        '"2021-02-28T23:15:00.000Z"',
      );
    });

    it("escape", () => {
      const tmpl = env.fromString("{{ x | tojson }}");
      expect(tmpl.render({ x: "\"ba&r'" })).toBe('"\\"ba\\u0026r\\u0027"');
      expect(tmpl.render({ x: "<bar>" })).toBe('"\\u003cbar\\u003e"');
      expect(tmpl.render({ x: { "<foo>": "</bar>" } })).toBe(
        '{"\\u003cfoo\\u003e":"\\u003c/bar\\u003e"}',
      );
      expect(tmpl.render({ x: ["<foo>", "<bar>"] })).toBe(
        '["\\u003cfoo\\u003e","\\u003cbar\\u003e"]',
      );
    });

    it("indent: 2", () => {
      let tmpl = env.fromString("{{ x | tojson(2) }}");
      expect(tmpl.render({ x: { foo: "bar" } })).toBe('{\n  "foo": "bar"\n}');
      expect(tmpl.render({ x: ["foo", "bar"] })).toBe(
        '[\n  "foo",\n  "bar"\n]',
      );
      tmpl = env.fromString("{{ x | tojson(indent=2) }}");
      expect(tmpl.render({ x: { foo: "bar" } })).toBe('{\n  "foo": "bar"\n}');
      expect(tmpl.render({ x: ["foo", "bar"] })).toBe(
        '[\n  "foo",\n  "bar"\n]',
      );
    });
  });

  describe("wordwrap", () => {
    it("basic", () => {
      const tmpl = env.fromString("{{ s | wordwrap(25) }}");
      expect(
        tmpl.render({ s: "Hello!\nThis is nunjucks saying something." }),
      ).toBe("Hello!\nThis is nunjucks saying s\nomething.");
      expect(
        tmpl.render({ s: "Hello!\n\n This is nunjucks saying something." }),
      ).toBe("Hello!\n\nThis is nunjucks saying s\nomething.");
      expect(
        tmpl.render({
          s: "lived long on the alms-basket of words. … for thou art not so long by the head as honorificabilitudinitatibus: thou art easier swallowed than a flap-dragon.",
        }),
      ).toBe(
        `lived long on the alms-ba
sket of words. … for thou
art not so long by the he
ad as honorificabilitudin
itatibus: thou art easier
swallowed than a flap-dra
gon.`,
      );
    });

    it("no breakLongWords", () => {
      const tmpl = env.fromString(
        "{{ s | wordwrap(width=25, breakLongWords=false) }}",
      );
      expect(
        tmpl.render({ s: "Hello!\nThis is nunjucks saying something." }),
      ).toBe("Hello!\nThis is nunjucks saying\nsomething.");
      expect(
        tmpl.render({ s: "Hello!\n\n This is nunjucks saying something." }),
      ).toBe("Hello!\n\nThis is nunjucks saying\nsomething.");
      expect(
        tmpl.render({
          s: "lived long on the alms-basket of words. … for thou art not so long by the head as honorificabilitudinitatibus: thou art easier swallowed than a flap-dragon.",
        }),
      ).toBe(
        `lived long on the alms-
basket of words. … for
thou art not so long by
the head as
honorificabilitudinitatibus:
thou art easier swallowed
than a flap-dragon.`,
      );
    });

    it("no breakOnHyphens (& no breakOnHyphens)", () => {
      let tmpl = env.fromString("{{ s | wordwrap(25, breakOnHyphens=false) }}");
      expect(
        tmpl.render({ s: "Hello!\nThis is nunjucks saying something." }),
      ).toBe("Hello!\nThis is nunjucks saying\nsomething.");
      expect(
        tmpl.render({
          s: "lived long on the alms-basket of words. … for thou art not so long by the head as honorificabilitudinitatibus: thou art easier swallowed than a flap-dragon.",
        }),
      ).toBe(
        `lived long on the
alms-basket of words. …
for thou art not so long
by the head as
honorificabilitudinitatibus:
thou art easier swallowed
than a flap-dragon.`,
      );
      tmpl = env.fromString(
        "{{ s | wordwrap(25, breakLongWords=false, breakOnHyphens=false) }}",
      );
      expect(
        tmpl.render({ s: "Hello!\nThis is nunjucks saying something." }),
      ).toBe("Hello!\nThis is nunjucks saying\nsomething.");
      expect(
        tmpl.render({
          s: "lived long on the alms-basket of words. … for thou art not so long by the head as honorificabilitudinitatibus: thou art easier swallowed than a flap-dragon.",
        }),
      ).toBe(
        `lived long on the
alms-basket of words. …
for thou art not so long
by the head as
honorificabilitudinitatibus:
thou art easier swallowed
than a flap-dragon.`,
      );
    });
  });

  describe("filter undefined", () => {
    it("basic", () => {
      expect(() => env.fromString("{{ var|f }}")).toThrow(
        "No filter named 'f'",
      );
    });

    it("inside if", () => {
      const tmpl = env.fromString(
        "{%- if x is defined -%}{{ x|f }}{%- else -%}x{% endif %}",
      );
      expect(tmpl.render()).toBe("x");
      expect(() => tmpl.render({ x: 42 })).toThrow("No filter named 'f'");
    });

    it("inside elif", () => {
      const tmpl = env.fromString(
        [
          "{%- if x is defined -%}{{ x }}{%- elif y is defined -%}",
          "{{ y|f }}{%- else -%}foo{%- endif -%}",
        ].join(""),
      );
      expect(tmpl.render()).toBe("foo");
      expect(() => tmpl.render({ y: 42 })).toThrow("No filter named 'f'");
    });

    it("inside else", () => {
      const tmpl = env.fromString(
        "{%- if x is not defined -%}foo{%- else -%}{{ x|f }}{%- endif -%}",
      );
      expect(tmpl.render()).toBe("foo");
      expect(() => tmpl.render({ x: 42 })).toThrow("No filter named 'f'");
    });

    it("inside nested if", () => {
      const tmpl = env.fromString(
        [
          "{%- if x is not defined -%}foo{%- else -%}{%- if y ",
          "is defined -%}{{ y|f }}{%- endif -%}{{ x }}{%- endif -%}",
        ].join(""),
      );
      expect(tmpl.render()).toBe("foo");
      expect(tmpl.render({ x: 42 })).toBe("42");
      expect(() => tmpl.render({ x: 42, y: 42 })).toThrow(
        "No filter named 'f'",
      );
    });

    it("inside condexpr", () => {
      const t1 = env.fromString("{{ x|f if x is defined else 'foo' }}");
      const t2 = env.fromString("{{ 'foo' if x is not defined else x|f }}");
      expect(t1.render()).toBe("foo");
      expect(t2.render()).toBe("foo");

      expect(() => t1.render({ x: 42 })).toThrow("No filter named 'f'");
      expect(() => t2.render({ x: 42 })).toThrow("No filter named 'f'");
    });
  });
});
