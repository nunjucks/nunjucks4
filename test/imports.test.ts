import { Environment } from "@nunjucks/environment";
import { ObjectSourceLoader } from "@nunjucks/loaders";
import { describe, expect, test } from "@jest/globals";
import { TemplateSyntaxError } from "@nunjucks/parser";
import {
  TemplateNotFound,
  TemplatesNotFound,
  UndefinedError,
} from "@nunjucks/runtime";

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

describe("imports", () => {
  test("simple", () => {
    const t = env.fromString('{% import "module" as m %}{{ m.test() }}');
    expect(t.render({ foo: 42 })).toBe("[|23]");
  });

  test("without context", () => {
    const t = env.fromString(
      '{% import "module" as m without context %}{{ m.test() }}',
    );
    expect(t.render({ foo: 42 })).toBe("[|23]");
  });

  test("with context", () => {
    const t = env.fromString(
      '{% import "module" as m with context %}{{ m.test() }}',
    );
    expect(t.render({ foo: 42 })).toBe("[42|23]");
  });

  test("from import", () => {
    const t = env.fromString('{% from "module" import test %}{{ test() }}');
    expect(t.render({ foo: 42 })).toBe("[|23]");
  });

  test("from import without context", () => {
    const t = env.fromString(
      '{% from "module" import test without context %}{{ test() }}',
    );
    expect(t.render({ foo: 42 })).toBe("[|23]");
  });

  test("from import with context", () => {
    const t = env.fromString(
      '{% from "module" import test with context %}{{ test() }}',
    );
    expect(t.render({ foo: 42 })).toBe("[42|23]");
  });

  test("needs name", () => {
    env.fromString('{% from "foo" import bar %}');
    env.fromString('{% from "foo" import bar, baz %}');
    expect(() => env.fromString('{% from "foo" import %}')).toThrow(
      TemplateSyntaxError,
    );
  });

  test("no trailing comma", () => {
    expect(() => env.fromString('{% from "foo" import bar, %}')).toThrow(
      TemplateSyntaxError,
    );
    expect(() => env.fromString('{% from "foo" import bar,, %}')).toThrow(
      TemplateSyntaxError,
    );
    expect(() => env.fromString('{% from "foo" import, %}')).toThrow(
      TemplateSyntaxError,
    );
  });

  test("trailing comma with context", () => {
    env.fromString('{% from "foo" import bar, baz with context %}');
    env.fromString('{% from "foo" import bar, baz, with context %}');
    env.fromString('{% from "foo" import bar, with context %}');
    env.fromString('{% from "foo" import bar, with, context %}');
    env.fromString('{% from "foo" import bar, with with context %}');

    expect(() =>
      env.fromString('{% from "foo" import bar,, with context %}'),
    ).toThrow(TemplateSyntaxError);

    expect(() =>
      env.fromString('{% from "foo" import bar with context, %}'),
    ).toThrow(TemplateSyntaxError);
  });

  test("exports", () => {
    const module = env.fromString(
      `
        {% macro toplevel() %}...{% endmacro %}
        {% macro __private() %}...{% endmacro %}
        {% set variable = 42 %}
        {% for item in [1] %}
            {% macro notthere() %}{% endmacro %}
        {% endfor %}
    `,
    ).module as any;
    expect(module.toplevel()).toBe("...");
    expect(module.variable).toBe(42);
  });

  test("not exported error", () => {
    const t = env.fromString(
      "{% from 'module' import nothing %}{{ nothing() }}",
    );
    expect(() => t.render()).toThrow(UndefinedError);
    expect(() => t.render()).toThrow(
      "does not export the requested name 'nothing'",
    );
  });

  test("import with globals", () => {
    let t = env.fromString('{% import "module" as m %}{{ m.test() }}', {
      globals: { foo: 42 },
    });
    expect(t.render()).toBe("[42|23]");
    t = env.fromString('{% import "module" as m %}{{ m.test() }}');
    expect(t.render()).toBe("[|23]");
  });

  test("import with globals override", () => {
    const t = env.fromString(
      '{% set foo = 41 %}{% import "module" as m %}{{ m.test() }}',
      {
        globals: { foo: 42 },
      },
    );
    expect(t.render()).toBe("[42|23]");
  });

  test("from import with globals", () => {
    const t = env.fromString('{% from "module" import test %}{{ test() }}', {
      globals: { foo: 42 },
    });
    expect(t.render()).toBe("[42|23]");
  });
});

describe("includes", () => {
  test("default context", () => {
    let t = env.fromString('{% include "header" %}');
    expect(t.render({ foo: 42 })).toBe("[42|23]");
    t = env.fromString("{% include x %}");
    expect(t.render({ foo: 42, x: "header" })).toBe("[42|23]");
    expect(() => t.render({ foo: 42, x: "missing" })).toThrow(TemplateNotFound);
  });

  test("without context", () => {
    const t = env.fromString('{% include "header" without context %}');
    expect(t.render({ foo: 42 })).toBe("[|23]");
  });

  test("with context", () => {
    const t = env.fromString('{% include "header" with context %}');
    expect(t.render({ foo: 42 })).toBe("[42|23]");
  });

  test("multiple templates", () => {
    let t = env.fromString('{% include ["missing", "header"] %}');
    expect(t.render({ foo: 42 })).toBe("[42|23]");
    t = env.fromString("{% include x %}");
    expect(t.render({ foo: 42, x: ["missing", "header"] })).toBe("[42|23]");
    expect(() => t.render({ foo: 42, x: ["missing", "missing2"] })).toThrow(
      TemplatesNotFound,
    );
  });

  test("ignore missing", () => {
    let t = env.fromString('{% include "missing" ignore missing %}');
    expect(t.render({ foo: 42 })).toBe("");

    t = env.fromString('{% include ["missing", "missing2"] ignore missing %}');
    expect(t.render({ foo: 42 })).toBe("");

    t = env.fromString("{% include x ignore missing %}");
    expect(t.render({ foo: 42, x: "missing" })).toBe("");
    expect(t.render({ foo: 42, x: ["missing", "missing2"] })).toBe("");

    t = env.fromString("{% include x ignore missing with context %}");
    expect(t.render({ foo: 42, x: "missing" })).toBe("");
    expect(t.render({ foo: 42, x: ["missing", "missing2"] })).toBe("");
    expect(t.render({ foo: 42, x: "header" })).toBe("[42|23]");
  });

  test("context include with overrides", () => {
    env = new Environment({
      async: false,
      loaders: [
        new ObjectSourceLoader({
          main: "{% for item in [1, 2, 3] %}{% include 'item' %}{% endfor %}",
          item: "{{ item }}",
        }),
      ],
    });
    expect(env.getTemplate("main").render()).toBe("123");
  });

  test("unoptimized scopes", () => {
    const t = env.fromString(`
      {% macro outer(o) %}
      {% macro inner() %}
      {% include "o_printer" %}
      {% endmacro %}
      {{ inner() }}
      {% endmacro %}
      {{ outer("FOO") }}
    `);
    expect(t.render().trim()).toBe("(FOO)");
  });

  test("import from with context", () => {
    env = new Environment({
      async: false,
      loaders: [
        new ObjectSourceLoader({
          a: "{% macro x() %}{{ foobar }}{% endmacro %}",
        }),
      ],
    });
    const t = env.fromString(
      "{% set foobar = 42 %}{% from 'a' import x with context %}{{ x() }}",
    );
    expect(t.render()).toBe("42");
  });
});
