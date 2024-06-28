import { Environment } from "@nunjucks/environment";
import { markSafe } from "@nunjucks/runtime";
import { describe, expect, it } from "@jest/globals";

async function* asyncGen<T>(
  iter: Iterable<T>,
): AsyncGenerator<T, void, unknown> {
  for await (const item of iter) yield item;
}

function* syncGen<T>(iter: Iterable<T>): Generator<T, void, unknown> {
  for (const item of iter) yield item;
}

describe("filters in async environment", () => {
  let env: Environment;

  beforeEach(() => {
    env = new Environment({ async: true });
  });

  describe("sum", () => {
    describe.each([["async"], ["sync"]])("%s iterable", (type) => {
      it("array", async () => {
        const arr = [1, 2, 3, 4, 5, 6];
        const items = type === "async" ? asyncGen(arr) : syncGen(arr);
        const tmpl = env.fromString("{{ items|sum() }}");
        expect(await tmpl.render({ items })).toBe("21");
      });

      it("attributes", async () => {
        const arr = [{ value: 23 }, { value: 1 }, { value: 18 }];
        const items = type === "async" ? asyncGen(arr) : syncGen(arr);
        const tmpl = env.fromString("{{ items|sum('value') }}");
        expect(await tmpl.render({ items })).toBe("42");
      });

      it("nested attributes", async () => {
        const arr = [
          { real: { value: 23 } },
          { real: { value: 1 } },
          { real: { value: 18 } },
        ];
        const items = type === "async" ? asyncGen(arr) : syncGen(arr);
        const tmpl = env.fromString("{{ items|sum('real.value') }}");
        expect(await tmpl.render({ items })).toBe("42");
      });

      it("index attribute", async () => {
        const values = { foo: 23, bar: 1, baz: 18 };
        const tmpl = env.fromString("{{ values|items()|sum('1') }}");
        expect(
          await tmpl.render({
            values: type === "async" ? Promise.resolve(values) : values,
          }),
        ).toBe("42");
      });
    });
  });

  it.each([["async"], ["sync"]])("slice with %s iterable", async (type) => {
    const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const items = () => (type === "async" ? asyncGen(arr) : syncGen(arr));
    const tmpl = env.fromString(
      "{{ items()|slice(3)|list }}|{{ items()|slice(3, 'X')|list }}",
    );
    expect(await tmpl.render({ items })).toBe(
      [
        "[[0, 1, 2, 3], [4, 5, 6], [7, 8, 9]]",
        "[[0, 1, 2, 3], [4, 5, 6, 'X'], [7, 8, 9, 'X']]",
      ].join("|"),
    );
  });

  describe("join", () => {
    it("number", async () => {
      const items = () => asyncGen([1, 2, 3]);
      const tmpl = env.fromString('{{ items() | join("|") }}');
      expect(await tmpl.render({ items })).toBe("1|2|3");
    });
    it("autoescape", async () => {
      env = new Environment({ async: true, autoescape: true });
      const items = () => asyncGen(["<foo>", markSafe("<span>foo</span>")]);
      const tmpl = env.fromString("{{ items() | join }}");
      expect(await tmpl.render({ items })).toBe("&lt;foo&gt;<span>foo</span>");
    });
    it("attribute", async () => {
      const users = () =>
        asyncGen(["foo", "bar"].map((username) => ({ username })));
      const tmpl = env.fromString("{{ users()|join(', ', 'username') }}");
      expect(await tmpl.render({ users })).toBe("foo, bar");
    });
  });

  describe("map", () => {
    it("simple", async () => {
      const items = asyncGen(["1", "2", "3"]);
      const tmpl = env.fromString('{{ items()|map("int")|sum }}');
      expect(await tmpl.render({ items: () => Promise.resolve(items) })).toBe(
        "6",
      );
    });

    it("map sum", async () => {
      const tmpl = env.fromString(
        '{{ [[1,2], [3], [4,5,6]]|map("sum")|list }}',
      );
      expect(await tmpl.render()).toBe("[3, 3, 15]");
    });

    it("attribute argument", async () => {
      const users = () =>
        Promise.resolve(
          asyncGen(["john", "jane", "mike"].map((name) => ({ name }))),
        );
      const tmpl = env.fromString(
        '{{ users()|map(attribute="name")|join("|") }}',
      );
      expect(await tmpl.render({ users })).toBe("john|jane|mike");
    });

    it("empty map", async () => {
      const tmpl = env.fromString('{{ none|map("upper")|list }}');
      expect(await tmpl.render()).toBe("[]");
    });
  });
});
