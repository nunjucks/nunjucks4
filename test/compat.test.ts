import * as nunjucks from "nunjucks";
import type { LegacyLoader } from "@nunjucks/loaders";
import { describe, expect, it } from "@jest/globals";

const { Environment, Template, ObjectSourceLoader } = nunjucks;

class MyLegacySyncLoader {
  getSource(name: string) {
    return {
      src: "Hello World",
      path: `/tmp/${name}`,
    };
  }
}

class MyLegacyAsyncLoader {
  async = true;
  getSource(name: string, callback: (err: any, res: any) => void) {
    callback(null, {
      src: "Hello World",
      path: `/tmp/${name}`,
    });
  }
}

async function* iter() {
  yield await Promise.resolve("a");
  yield await new Promise((resolve) => {
    setTimeout(() => resolve("b"), 50);
  });
  yield await new Promise((resolve) => {
    setTimeout(() => resolve("c"), 75);
  });
}

describe("v3 compatibility", () => {
  describe("Environment", () => {
    it("constructor with single loader", () => {
      const loader = new ObjectSourceLoader({ include: "foo" });
      const env = new Environment(loader);
      const tmpl = env.fromString("{% include 'include' %}");
      expect(tmpl.render()).toBe("foo");
    });
    it("constructor with multiple loaders", () => {
      const loader = new ObjectSourceLoader({ include: "foo" });
      const env = new Environment([loader]);
      const tmpl = env.fromString("{% include 'include' %}");
      expect(tmpl.render()).toBe("foo");
    });
    it("constructor with sync legacy loader", () => {
      const loader = new MyLegacySyncLoader();
      const env = new Environment(loader);
      const tmpl = env.getTemplate("blah");
      expect(tmpl.render()).toBe("Hello World");
    });

    it("constructor with async legacy loader", async () => {
      const loader = new MyLegacyAsyncLoader() as LegacyLoader<true>;
      const env = new Environment(loader);
      const tmpl = await env.getTemplate("blah");
      expect(await tmpl.render()).toBe("Hello World");
    });

    it("render callback", async () => {
      const loader = new ObjectSourceLoader({ tmpl: "foo{{ bar }}" });
      const env = new Environment({ loaders: [loader] });
      const result = await new Promise((resolve, reject) => {
        env.render("tmpl", { bar: "bar" }, (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res!);
          }
        });
      });
      expect(result).toBe("foobar");
    });

    it("async render callback", async () => {
      const loader = new ObjectSourceLoader({
        tmpl: "{% for x in iter %}{{ x }}{% endfor %}",
      });
      const env = new Environment({ async: true, loaders: [loader] });
      const result = await new Promise((resolve, reject) => {
        env.render("tmpl", { iter: iter() }, (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res!);
          }
        });
      });
      expect(result).toBe("abc");
    });

    it("renderString callback", async () => {
      const env = new Environment();
      const result = await new Promise((resolve, reject) => {
        env.renderString("foo{{ bar }}", { bar: "bar" }, (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res!);
          }
        });
      });
      expect(result).toBe("foobar");
    });

    it("async renderString callback", async () => {
      const env = new Environment({ async: true });
      const result = await new Promise((resolve, reject) => {
        env.renderString(
          "{% for x in iter %}{{ x }}{% endfor %}",
          { iter: iter() },
          (err, res) => {
            if (err) {
              reject(err);
            } else {
              resolve(res!);
            }
          },
        );
      });
      expect(result).toBe("abc");
    });
  });

  describe("Template", () => {
    it("legacy constructor, string argument", () => {
      const env = new Environment();
      const tmpl = new Template("Hello World", env, "path.html");
      expect(tmpl.render()).toBe("Hello World");
    });
    it("legacy constructor, object argument ", () => {
      const env = new Environment();
      const tmpl = new Template(
        { type: "string", obj: "Hello World" },
        env,
        "path.html",
      );
      expect(tmpl.render()).toBe("Hello World");
    });

    it("render callback", async () => {
      const env = new Environment();
      const tmpl = env.fromString("{% for x in iter %}{{ x }}{% endfor %}");
      const result = await new Promise<string>((resolve, reject) => {
        tmpl.render({ iter: ["a", "b", "c"] }, (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res!);
          }
        });
      });
      expect(result).toBe("abc");
    });

    it("async render callback", async () => {
      const env = new Environment({ async: true });
      const tmpl = env.fromString("{% for x in iter %}{{ x }}{% endfor %}");
      const result = await new Promise<string>((resolve, reject) => {
        tmpl.render({ iter: iter() }, (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res!);
          }
        });
      });
      expect(result).toBe("abc");
    });
  });
});
