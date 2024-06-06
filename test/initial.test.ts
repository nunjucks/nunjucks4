import { Environment, ObjectSourceLoader } from "@nunjucks/environment";
import { describe, expect, test } from "@jest/globals";

describe("async imports", () => {
  let env: Environment<true>;

  beforeEach(() => {
    env = new Environment({
      async: true,
      globals: { bar: 23 },
      loaders: [
        new ObjectSourceLoader({
          module: "{% macro test() %}[{{ foo }}|{{ bar }}]{% endmacro %}",
          header: "[{{ foo }}|{{ 23 }}]",
          o_printer: "({{ o }})",
        }),
      ],
    });
  });

  test("async import macro", async () => {
    const t = env.fromString('{% import "module" as m %}{{ m.test() }}');
    expect(await t.render({ foo: 42 })).toBe("[|23]");
  });

  test("async import macro without context", async () => {
    const t = env.fromString(
      '{% import "module" as m without context %}{{ m.test() }}'
    );
    expect(await t.render({ foo: 42 })).toBe("[|23]");
  });

  test("async import macro with context", async () => {
    const t = env.fromString(
      '{% import "module" as m with context %}{{ m.test() }}'
    );
    expect(await t.render({ foo: 42 })).toBe("[42|23]");
  });

  test("async from import macro", async () => {
    const t = env.fromString('{% from "module" import test %}{{ test() }}');
    expect(await t.render({ foo: 42 })).toBe("[|23]");
  });

  test("async from import macro without context", async () => {
    const t = env.fromString(
      '{% from "module" import test without context %}{{ test() }}'
    );
    expect(await t.render({ foo: 42 })).toBe("[|23]");
  });

  test("async from import macro with context", async () => {
    const t = env.fromString(
      '{% from "module" import test with context %}{{ test() }}'
    );
    expect(await t.render({ foo: 42 })).toBe("[42|23]");
  });

  it("import with globals", async () => {
    const t = env.fromString('{% import "module" as m %}{{ m.test() }}', {
      globals: { foo: 42 },
    });
    expect(await t.render()).toBe("[42|23]");
  });

  it("import with globals override", async () => {
    const t = env.fromString(
      '{% set foo = 41 %}{% import "module" as m %}{{ m.test() }}',
      { globals: { foo: 42 } }
    );
    expect(await t.render()).toBe("[42|23]");
  });

  it("from import with globals", async () => {
    const t = env.fromString('{% from "module" import test %}{{ test() }}', {
      globals: { foo: 42 },
    });
    expect(await t.render()).toBe("[42|23]");
  });
});

describe("sync includes", () => {
  let env: Environment<false>;

  beforeEach(() => {
    env = new Environment({
      async: false,
      globals: { bar: 23 },
      loaders: [
        new ObjectSourceLoader({
          module: "{% macro test() %}[{{ foo }}|{{ bar }}]{% endmacro %}",
          header: "[{{ foo }}|{{ 23 }}]",
          o_printer: "({{ o }})",
        }),
      ],
    });
  });

  it("context include", () => {
    let t = env.fromString('{% include "header" %}');
    expect(t.render({ foo: 42 })).toBe("[42|23]");
    t = env.fromString('{% include "header" with context %}');
    expect(t.render({ foo: 42 })).toBe("[42|23]");
    t = env.fromString('{% include "header" without context %}');
    expect(t.render({ foo: 42 })).toBe("[|23]");
  });
});

describe("async includes", () => {
  let env: Environment<true>;

  beforeEach(() => {
    env = new Environment({
      async: true,
      globals: { bar: 23 },
      loaders: [
        new ObjectSourceLoader({
          module: "{% macro test() %}[{{ foo }}|{{ bar }}]{% endmacro %}",
          header: "[{{ foo }}|{{ 23 }}]",
          o_printer: "({{ o }})",
        }),
      ],
    });
  });

  it("context include", async () => {
    let t = env.fromString('{% include "header" %}');
    expect(await t.render({ foo: 42 })).toBe("[42|23]");
    t = env.fromString('{% include "header" with context %}');
    expect(await t.render({ foo: 42 })).toBe("[42|23]");
    t = env.fromString('{% include "header" without context %}');
    expect(await t.render({ foo: 42 })).toBe("[|23]");
  });
});

describe("uncategorized", () => {
  test("macro", () => {
    const env = new Environment();
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
  test("recursive loop", () => {
    const env = new Environment();
    const tmpl = env.fromString(`
      {%- for item in seq recursive -%}
      [{{ item.a }}{% if item.b %}<{{ loop(item.b) }}>{% endif %}]
      {%- endfor -%}
    `);

    expect(
      tmpl.render({
        seq: [
          { a: 1, b: [{ a: 1 }, { a: 2 }] },
          { a: 2, b: [{ a: 1 }, { a: 2 }] },
          { a: 3, b: [{ a: "a" }] },
        ],
      })
    ).toBe("[1<[1][2]>][2<[1][2]>][3<[a]>]");
  });

  test("recursive loop async", async () => {
    const env = new Environment({ async: true });
    const tmpl = env.fromString(`
      {%- for item in seq recursive -%}
      [{{ item.a }}{% if item.b %}<{{ loop(item.b) }}>{% endif %}]
      {%- endfor -%}
    `);

    expect(
      await tmpl.render({
        seq: [
          { a: 1, b: [{ a: 1 }, { a: 2 }] },
          { a: 2, b: [{ a: 1 }, { a: 2 }] },
          { a: 3, b: [{ a: "a" }] },
        ],
      })
    ).toBe("[1<[1][2]>][2<[1][2]>][3<[a]>]");
  });

  test("recursive lookaround", () => {
    const env = new Environment();
    const tmpl = env.fromString(`
      {%- for item in seq recursive -%}
          [{{ loop.previtem.a if loop.previtem is defined else 'x' }}.{{
          item.a }}.{{ loop.nextitem.a if loop.nextitem is defined else 'x'
          }}{% if item.b %}<{{ loop(item.b) }}>{% endif %}]
      {%- endfor -%}
    `);

    expect(
      tmpl.render({
        seq: [
          { a: 1, b: [{ a: 1 }, { a: 2 }] },
          { a: 2, b: [{ a: 1 }, { a: 2 }] },
          { a: 3, b: [{ a: "a" }] },
        ],
      })
    ).toBe("[x.1.2<[x.1.2][1.2.x]>][1.2.3<[x.1.2][1.2.x]>][2.3.x<[x.a.x]>]");
  });

  test("recursive lookaround async", async () => {
    const env = new Environment({ async: true });
    const tmpl = env.fromString(`
      {%- for item in seq recursive -%}
          [{{ loop.previtem.a if loop.previtem is defined else 'x' }}.{{
          item.a }}.{{ loop.nextitem.a if loop.nextitem is defined else 'x'
          }}{% if item.b %}<{{ loop(item.b) }}>{% endif %}]
      {%- endfor -%}
    `);

    expect(
      await tmpl.render({
        seq: [
          { a: 1, b: [{ a: 1 }, { a: 2 }] },
          { a: 2, b: [{ a: 1 }, { a: 2 }] },
          { a: 3, b: [{ a: "a" }] },
        ],
      })
    ).toBe("[x.1.2<[x.1.2][1.2.x]>][1.2.3<[x.1.2][1.2.x]>][2.3.x<[x.a.x]>]");
  });

  test("recursive depth0", () => {
    const env = new Environment();
    const tmpl = env.fromString(
      [
        "{% for item in seq recursive %}[{{ loop.depth0 }}:{{ item.a }}",
        "{% if item.b %}<{{ loop(item.b) }}>{% endif %}]{% endfor %}",
      ].join("")
    );

    expect(
      tmpl.render({
        seq: [
          { a: 1, b: [{ a: 1 }, { a: 2 }] },
          { a: 2, b: [{ a: 1 }, { a: 2 }] },
          { a: 3, b: [{ a: "a" }] },
        ],
      })
    ).toBe("[0:1<[1:1][1:2]>][0:2<[1:1][1:2]>][0:3<[1:a]>]");
  });

  test("recursive depth0 async", async () => {
    const env = new Environment({ async: true });
    const tmpl = env.fromString(
      [
        "{% for item in seq recursive %}[{{ loop.depth0 }}:{{ item.a }}",
        "{% if item.b %}<{{ loop(item.b) }}>{% endif %}]{% endfor %}",
      ].join("")
    );

    expect(
      await tmpl.render({
        seq: [
          { a: 1, b: [{ a: 1 }, { a: 2 }] },
          { a: 2, b: [{ a: 1 }, { a: 2 }] },
          { a: 3, b: [{ a: "a" }] },
        ],
      })
    ).toBe("[0:1<[1:1][1:2]>][0:2<[1:1][1:2]>][0:3<[1:a]>]");
  });

  test("nested loop", () => {
    const env = new Environment();
    const tmpl = env.fromString(`
        {%- for row in table %}
            {%- set rowloop = loop -%}
            {% for cell in row -%}
                [{{ rowloop.index }}|{{ loop.index }}]
            {%- endfor %}
        {%- endfor -%}
        `);
    expect(tmpl.render({ table: ["ab", "cd"] })).toBe("[1|1][1|2][2|1][2|2]");
  });

  test("async nested loop", async () => {
    const env = new Environment({ async: true });
    const tmpl = env.fromString(`
        {%- for row in table %}
            {%- set rowloop = loop -%}
            {% for cell in row -%}
                [{{ rowloop.index }}|{{ loop.index }}]
            {%- endfor %}
        {%- endfor -%}
        `);
    expect(await tmpl.render({ table: ["ab", "cd"] })).toBe(
      "[1|1][1|2][2|1][2|2]"
    );
  });

  test("scoped special var", () => {
    const env = new Environment();
    const tmpl = env.fromString(
      [
        "{% for s in seq %}[{{ loop.first }}{% for c in s %}",
        "|{{ loop.first }}{% endfor %}]{% endfor %}",
      ].join("")
    );

    expect(
      tmpl.render({
        seq: ["ab", "cd"],
      })
    ).toBe("[true|true|false][false|true|false]");
  });

  test("async scoped special var", async () => {
    const env = new Environment({ async: true });
    const tmpl = env.fromString(
      [
        "{% for s in seq %}[{{ loop.first }}{% for c in s %}",
        "|{{ loop.first }}{% endfor %}]{% endfor %}",
      ].join("")
    );

    expect(
      await tmpl.render({
        seq: ["ab", "cd"],
      })
    ).toBe("[true|true|false][false|true|false]");
  });

  test("scoped loop var", () => {
    const env = new Environment();
    const tmpl1 = env.fromString(
      "{% for x in seq %}{{ loop.first }}{% for y in seq %}{% endfor %}{% endfor %}"
    );
    expect(tmpl1.render({ seq: "ab" })).toBe("truefalse");
    const tmpl2 = env.fromString(
      "{% for x in seq %}{% for y in seq %}{{ loop.first }}{% endfor %}{% endfor %}"
    );
    expect(tmpl2.render({ seq: "ab" })).toBe("truefalsetruefalse");
  });

  test("async scoped loop var", async () => {
    const env = new Environment({ async: true });
    const tmpl1 = env.fromString(
      "{% for x in seq %}{{ loop.first }}{% for y in seq %}{% endfor %}{% endfor %}"
    );
    expect(await tmpl1.render({ seq: "ab" })).toBe("truefalse");
    const tmpl2 = env.fromString(
      "{% for x in seq %}{% for y in seq %}{{ loop.first }}{% endfor %}{% endfor %}"
    );
    expect(await tmpl2.render({ seq: "ab" })).toBe("truefalsetruefalse");
  });

  test("call in loop", () => {
    const env = new Environment();
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

  test("async call in loop", async () => {
    const env = new Environment({ async: true });
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
    expect(await tmpl.render()).toBe("[1][2][3]");
  });

  test("unpacking", () => {
    const env = new Environment();
    const tmpl = env.fromString(
      "{% for a, b, c in [[1, 2, 3]] %}{{ a }}|{{ b }}|{{ c }}{% endfor %}"
    );
    expect(tmpl.render()).toBe("1|2|3");
  });

  test("recursive loop filter", () => {
    const env = new Environment({ async: false });
    const t = env.fromString(`
  <?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    {%- for page in [site.root] if page.url != this recursive %}
    <url><loc>{{ page.url }}</loc></url>
    {{- loop(page.children) }}
    {%- endfor %}
  </urlset>`);
    const result = t.render({
      this: "/foo",
      site: {
        root: { url: "/", children: [{ url: "/foo" }, { url: "/bar" }] },
      },
    });
    const lines = result
      .trim()
      .split("\n")
      .filter((s) => !!s.trim())
      .map((s) => s.trim());
    expect(lines).toStrictEqual([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      "<url><loc>/</loc></url>",
      "<url><loc>/bar</loc></url>",
      "</urlset>",
    ]);
  });

  test("async recursive loop filter", async () => {
    const env = new Environment({ async: true });
    const t = env.fromString(`
  <?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    {%- for page in [site.root] if page.url != this recursive %}
    <url><loc>{{ page.url }}</loc></url>
    {{- loop(page.children) }}
    {%- endfor %}
  </urlset>`);
    const result = await t.render({
      this: "/foo",
      site: {
        root: { url: "/", children: [{ url: "/foo" }, { url: "/bar" }] },
      },
    });
    const lines = result
      .trim()
      .split("\n")
      .filter((s) => !!s.trim())
      .map((s) => s.trim());
    expect(lines).toStrictEqual([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      "<url><loc>/</loc></url>",
      "<url><loc>/bar</loc></url>",
      "</urlset>",
    ]);
  });

  test("non-recursive loop filter", () => {
    const env = new Environment({ async: false });
    const t = env.fromString(`
  <?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    {%- for page in items if page.url != this %}
    <url><loc>{{ page.url }}</loc></url>
    {%- endfor %}
  </urlset>`);
    const result = t.render({
      this: "/foo",
      items: [{ url: "/" }, { url: "/foo" }, { url: "/bar" }],
    });
    const lines = result
      .trim()
      .split("\n")
      .filter((s) => !!s.trim())
      .map((s) => s.trim());
    expect(lines).toStrictEqual([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      "<url><loc>/</loc></url>",
      "<url><loc>/bar</loc></url>",
      "</urlset>",
    ]);
  });

  test("async non-recursive loop filter", async () => {
    const env = new Environment({ async: true });
    const t = env.fromString(`
  <?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    {%- for page in items if page.url != this %}
    <url><loc>{{ page.url }}</loc></url>
    {%- endfor %}
  </urlset>`);
    const result = await t.render({
      this: "/foo",
      items: [{ url: "/" }, { url: "/foo" }, { url: "/bar" }],
    });
    const lines = result
      .trim()
      .split("\n")
      .filter((s) => !!s.trim())
      .map((s) => s.trim());
    expect(lines).toStrictEqual([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      "<url><loc>/</loc></url>",
      "<url><loc>/bar</loc></url>",
      "</urlset>",
    ]);
  });

  test("awaitable property slicing", () => {
    const env = new Environment({ async: false });
    const t = env.fromString("{% for x in a.b[:1] %}{{ x }}{% endfor %}");
    expect(t.render({ a: { b: [1, 2, 3] } })).toBe("1");
  });

  test("loop.changed", () => {
    const env = new Environment({ async: false });
    const t = env.fromString(`
      {%- for item in seq -%}
      {{ loop.changed(item) }},
      {%- endfor -%}
    `);
    expect(t.render({ seq: [null, null, 1, 2, 2, 3, 4, 4, 4] })).toBe(
      "true,false,true,true,false,true,true,false,false,"
    );
  });

  test("await on calls", async () => {
    const env = new Environment({ async: true });
    const t = env.fromString("{{ async_func() + normal_func() }}");
    expect(
      await t.render({
        async async_func() {
          return 42;
        },
        normal_func() {
          return 23;
        },
      })
    ).toBe("65");
  });
  //
  //   test("await on calls in macros", async () => {
  //     const env = new Environment({ async:  true });
  //     const t = env.fromString("{{ async_func() + normal_func() }}");
  //     expect(
  //       await t.render({
  //         async async_func() {
  //           return 42;
  //         },
  //         normal_func() {
  //           return 23;
  //         },
  //       })
  //     ).toBe("65");
  //   });
});

describe("async env", () => {
  test("context imports", async () => {});
});
