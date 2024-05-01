import { Environment, ObjectSourceLoader } from "@nunjucks/environment";
import { TemplateRuntimeError } from "@nunjucks/runtime";
import { describe, expect, test } from "@jest/globals";
import { TemplateSyntaxError } from "@nunjucks/parser";

const LAYOUTTEMPLATE = `|{% block block1 %}block 1 from layout{% endblock %}
|{% block block2 %}block 2 from layout{% endblock %}
|{% block block3 %}
{% block block4 %}nested block 4 from layout{% endblock %}
{% endblock %}|`;

const LEVEL1TEMPLATE = `{% extends "layout" %}
{% block block1 %}block 1 from level1{% endblock %}`;

const LEVEL2TEMPLATE = `{% extends "level1" %}
{% block block2 %}{% block block5 %}nested block 5 from level2{%
endblock %}{% endblock %}`;

const LEVEL3TEMPLATE = `{% extends "level2" %}
{% block block5 %}block 5 from level3{% endblock %}
{% block block4 %}block 4 from level3{% endblock %}
`;

const LEVEL4TEMPLATE = `{% extends "level3" %}
{% block block3 %}block 3 from level4{% endblock %}
`;

const WORKINGTEMPLATE = `{% extends "layout" %}
{% block block1 %}
  {% if false %}
    {% block block2 %}
      this should work
    {% endblock %}
  {% endif %}
{% endblock %}
`;

const DOUBLEEXTENDS = `
{% extends "layout" %}
{% extends "layout" %}
{% block block1 %}
  {% if false %}
    {% block block2 %}
      this should work
    {% endblock %}
  {% endif %}
{% endblock %}
`;

describe("inheritance", () => {
  let env: Environment<false>;

  beforeEach(() => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          layout: LAYOUTTEMPLATE,
          level1: LEVEL1TEMPLATE,
          level2: LEVEL2TEMPLATE,
          level3: LEVEL3TEMPLATE,
          level4: LEVEL4TEMPLATE,
          working: WORKINGTEMPLATE,
          doublee: DOUBLEEXTENDS,
        }),
      ],
      parserOpts: { trimBlocks: true },
    });
  });
  it("renders base template with blocks and no extends", () => {
    const tmpl = env.getTemplate("layout");
    expect(tmpl.render()).toBe(
      "|block 1 from layout|block 2 from layout|nested block 4 from layout|"
    );
  });
  it("renders inherited templates one level deep", () => {
    const tmpl = env.getTemplate("level1");
    expect(tmpl.render()).toBe(
      "|block 1 from level1|block 2 from layout|nested block 4 from layout|"
    );
  });
  it("renders inherited templates two levels deep", () => {
    const tmpl = env.getTemplate("level2");
    expect(tmpl.render()).toBe(
      [
        "|block 1 from level1|nested block 5 from ",
        "level2|nested block 4 from layout|",
      ].join("")
    );
  });
  it("renders inherited templates three levels deep", () => {
    const tmpl = env.getTemplate("level3");
    expect(tmpl.render()).toBe(
      "|block 1 from level1|block 5 from level3|block 4 from level3|"
    );
  });
  it("renders inherited templates four levels deep", () => {
    const tmpl = env.getTemplate("level4");
    expect(tmpl.render()).toBe(
      "|block 1 from level1|block 5 from level3|block 3 from level4|"
    );
  });
  it("supports block super() calls", () => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          a: "{% block intro %}INTRO{% endblock %}|BEFORE|{% block data %}INNER{% endblock %}|AFTER",
          b: '{% extends "a" %}{% block data %}({{ super() }}){% endblock %}',
          c: '{% extends "b" %}{% block intro %}--{{ super() }}--{% endblock %}\n{% block data %}[{{ super() }}]{% endblock %}',
        }),
      ],
    });
    const tmpl = env.getTemplate("c");
    expect(tmpl.render()).toBe("--INTRO--|BEFORE|[(INNER)]|AFTER");
  });

  it("reuses blocks", () => {
    const tmpl = env.fromString(
      "{{ self.foo() }}|{% block foo %}42{% endblock %}|{{ self.foo() }}"
    );
    expect(tmpl.render()).toBe("42|42|42");
  });
  it("hoists blocks", () => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          a: [
            "{% if false %}{% block x %}A{% endblock %}",
            "{% endif %}{{ self.x() }}",
          ].join(""),
          b: '{% extends "a" %}{% block x %}B{{ super() }}{% endblock %}',
        }),
      ],
    });
    const tmpl = env.getTemplate("b");
    expect(tmpl.render()).toBe("BA");
  });
  it("supports dynamic inheritance", () => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          default1: "DEFAULT1{% block x %}{% endblock %}",
          default2: "DEFAULT2{% block x %}{% endblock %}",
          child: "{% extends default %}{% block x %}CHILD{% endblock %}",
        }),
      ],
    });
    const tmpl = env.getTemplate("child");
    expect(tmpl.render({ default: "default1" })).toBe("DEFAULT1CHILD");
    expect(tmpl.render({ default: "default2" })).toBe("DEFAULT2CHILD");
  });
  it("supports multiple inheritance", () => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          default1: "DEFAULT1{% block x %}{% endblock %}",
          default2: "DEFAULT2{% block x %}{% endblock %}",
          child: [
            "{% if default %}{% extends default %}{% else %}",
            "{% extends 'default1' %}{% endif %}",
            "{% block x %}CHILD{% endblock %}",
          ].join(""),
        }),
      ],
    });
    const tmpl = env.getTemplate("child");
    expect(tmpl.render({ default: "default2" })).toBe("DEFAULT2CHILD");
    expect(tmpl.render({ default: "default1" })).toBe("DEFAULT1CHILD");
    expect(tmpl.render()).toBe("DEFAULT1CHILD");
  });

  it("supports scoped blocks", () => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          "default.html": [
            "{% for item in seq %}[{% block item scoped %}",
            "{% endblock %}]{% endfor %}",
          ].join(""),
        }),
      ],
    });
    const t = env.fromString(
      "{% extends 'default.html' %}{% block item %}{{ item }}{% endblock %}"
    );
    expect(t.render({ seq: [0, 1, 2, 3, 4] })).toBe("[0][1][2][3][4]");
  });
  it("supports super() in scoped blocks", () => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          "default.html": [
            "{% for item in seq %}[{% block item scoped %}",
            "{{ item }}{% endblock %}]{% endfor %}",
          ].join(""),
        }),
      ],
    });
    const t = env.fromString(
      [
        '{% extends "default.html" %}{% block item %}',
        "{{ super() }}|{{ item * 2 }}{% endblock %}",
      ].join("")
    );
    expect(t.render({ seq: [0, 1, 2, 3, 4] })).toBe(
      "[0|0][1|2][2|4][3|6][4|8]"
    );
  });

  it("supports scoped block after inheritance", () => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          "layout.html": "{% block useless %}{% endblock %}",
          "index.html": `
            {%- extends 'layout.html' %}
            {% from 'helpers.html' import foo with context %}
            {% block useless %}
                {% for x in [1, 2, 3] %}
                    {% block testing scoped %}
                        {{ foo(x) }}
                    {% endblock %}
                {% endfor %}
            {% endblock %}
          `,
          "helpers.html": "{% macro foo(x) %}{{ the_foo + x }}{% endmacro %}",
        }),
      ],
    });
    const rv = env.getTemplate("index.html").render({ the_foo: 42 });
    expect(
      rv
        .split(/\n/g)
        .map((s) => s.trim())
        .filter((s) => !!s)
    ).toStrictEqual(["43", "44", "45"]);
  });

  it("supports required blocks", () => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          default: "{% block x required %}{# comment #}\n {% endblock %}",
          level1: "{% extends 'default' %}{% block x %}[1]{% endblock %}",
        }),
      ],
    });
    const rv = env.getTemplate("level1").render();
    expect(rv).toBe("[1]");
  });
  it("supports required blocks with two levels of inheritance", () => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          default: "{% block x required %}{% endblock %}",
          level1: "{% extends 'default' %}{% block x %}[1]{% endblock %}",
          level2: "{% extends 'default' %}{% block x %}[2]{% endblock %}",
        }),
      ],
    });
    const rv1 = env.getTemplate("level1").render();
    const rv2 = env.getTemplate("level2").render();

    expect(rv1).toBe("[1]");
    expect(rv2).toBe("[2]");
  });
  it("supports required blocks with three levels of inheritance", () => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          default: "{% block x required %}{% endblock %}",
          level1: "{% extends 'default' %}",
          level2: "{% extends 'level1' %}{% block x %}[2]{% endblock %}",
          level3: "{% extends 'level2' %}",
        }),
      ],
    });
    const t1 = env.getTemplate("level1");
    const t2 = env.getTemplate("level2");
    const t3 = env.getTemplate("level3");

    expect(() => t1.render()).toThrow(TemplateRuntimeError);
    expect(() => t1.render()).toThrow("Required block 'x' not found");

    // with pytest.raises(TemplateRuntimeError, match="Required block 'x' not found"):
    //     assert t1.render()

    expect(t2.render()).toBe("[2]");
    expect(t3.render()).toBe("[2]");
  });

  it("throw error for invalid required blocks", () => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          empty: "{% block x required %}{% endblock %}",
          blank: "{% block x required %} {# c #}{% endblock %}",
          text: "{% block x required %}data {# c #}{% endblock %}",
          block:
            "{% block x required %}{% block y %}{% endblock %}{% endblock %}",
          if: "{% block x required %}{% if true %}{% endif %}{% endblock %}",
          top: "{% extends t %}{% block x %}CHILD{% endblock %}",
        }),
      ],
    });
    const t = env.getTemplate("top");
    expect(t.render({ t: "empty" })).toBe("CHILD");
    expect(t.render({ t: "blank" })).toBe("CHILD");

    const requiredBlockCheck = (context: Record<string, any>) => {
      const fn = () => t.render(context);
      expect(fn).toThrow(TemplateSyntaxError);
      expect(fn).toThrow(
        "Required blocks can only contain comments or whitespace"
      );
    };

    requiredBlockCheck({ t: "text" });
    requiredBlockCheck({ t: "block" });
    requiredBlockCheck({ t: "if" });
  });
  it("supports scoped required blocks", () => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          default1:
            "{% for item in seq %}[{% block item scoped required %}{% endblock %}]{% endfor %}",
          child1:
            "{% extends 'default1' %}{% block item %}{{ item }}{% endblock %}",
          default2:
            "{% for item in seq %}[{% block item required scoped %}{% endblock %}]{% endfor %}",
          child2:
            "{% extends 'default2' %}{% block item %}{{ item }}{% endblock %}",
        }),
      ],
    });
    const t1 = env.getTemplate("child1");
    const t2 = env.getTemplate("child2");

    expect(t1.render({ seq: [0, 1, 2] })).toBe("[0][1][2]");

    // scoped must come before required
    expect(() => t2.render({ seq: [0, 1, 2] })).toThrow(TemplateSyntaxError);
  });
  it("throws error for duplicate scoped or required block modifiers", () => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          default1:
            "{% for item in seq %}[{% block item scoped scoped %}}{{% endblock %}}]{{% endfor %}}",
          default2:
            "{% for item in seq %}[{% block item required required %}}{{% endblock %}}]{{% endfor %}}",
          child:
            "{% if default %}{% extends default %}{% else %}{% extends 'default1' %}{% endif %}{%- block x %}CHILD{% endblock %}",
        }),
      ],
    });
    const tmpl = env.getTemplate("child");

    expect(() => tmpl.render({ default: "default1", seq: [0, 1, 2] })).toThrow(
      TemplateSyntaxError
    );

    expect(() => tmpl.render({ default: "default2", seq: [0, 1, 2] })).toThrow(
      TemplateSyntaxError
    );
  });
  it("handles macro block scoping correctly", () => {
    env = new Environment({
      loaders: [
        new ObjectSourceLoader({
          "test.html": `
    {% extends 'details.html' %}

    {% macro my_macro() %}
    my_macro
    {% endmacro %}

    {% block inner_box %}
        {{ my_macro() }}
    {% endblock %}
        `,
          "details.html": `
    {% extends 'standard.html' %}

    {% macro my_macro() %}
    my_macro
    {% endmacro %}

    {% block content %}
        {% block outer_box %}
            outer_box
            {% block inner_box %}
                inner_box
            {% endblock %}
        {% endblock %}
    {% endblock %}
    `,
          "standard.html": `
    {% block content %}&nbsp;{% endblock %}
    `,
        }),
      ],
    });
    const t = env.getTemplate("test.html");
    expect(
      t
        .render()
        .split(/\n/g)
        .map((s) => s.trim())
        .filter((s) => !!s)
    ).toStrictEqual(["outer_box", "my_macro"]);
  });

  it("throws error for double extends", () => {
    expect(() => env.getTemplate("doublee").render()).toThrow(
      TemplateRuntimeError
    );
    expect(() => env.getTemplate("doublee").render()).toThrow(
      "extended multiple times"
    );
  });
});
