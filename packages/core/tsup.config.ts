import { defineConfig } from "tsup";

export default defineConfig((options) => ({
  entry: {
    nunjucks: "src/index.ts",
    "nunjucks-slim": "src/slim.ts",
  },
  minify: !!options.minify,
  splitting: false,
  sourcemap: true,
  treeshake: { preset: "smallest", moduleSideEffects: false },
  clean: false,
  outDir: "browser",
  platform: "browser",
  format: ["esm", "iife"],
  target: "es2020",
  globalName: "nunjucks",
  noExternal: [/^@nunjucks/],
  outExtension({ format }) {
    return {
      js: `${options.minify ? ".min" : ""}.${format === "esm" ? "m" : ""}js`,
    };
  },
}));
