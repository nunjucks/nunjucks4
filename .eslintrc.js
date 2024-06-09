/* eslint-disable */
module.exports = {
  extends: [
    "eslint:recommended",
    // Consider substituting for: "strict-type-checked"
    "plugin:@typescript-eslint/recommended-type-checked",
    "plugin:@typescript-eslint/stylistic-type-checked",
    "plugin:import/typescript",
    "plugin:prettier/recommended",
  ],
  overrides: [
    {
      files: ["*.js"],
      extends: ["plugin:@typescript-eslint/disable-type-checked"],
    },
    {
      files: ["**/*.ts"],
      rules: {
        "@typescript-eslint/camelcase": "off",
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        "@typescript-eslint/restrict-template-expressions": "off",
        "@typescript-eslint/no-inferrable-types": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-argument": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "@typescript-eslint/no-unsafe-declaration-merging": "off",
        "@typescript-eslint/class-literal-property-style": "off",
        "prettier/prettier": ["error"],
        "no-unexpected-multiline": "off", // conflicts with prettier
        "@typescript-eslint/ban-types": [
          "error",
          {
            types: {
              String: {
                message: "Use string instead",
                fixWith: "string",
              },
              Boolean: {
                message: "Use boolean instead",
                fixWith: "boolean",
              },
              Number: {
                message: "Use number instead",
                fixWith: "number",
              },
              Symbol: {
                message: "Use symbol instead",
                fixWith: "symbol",
              },
              // object typing
              Object: {
                message: [
                  'The `Object` type actually means "any non-nullish value", so it is marginally better than `unknown`.',
                  '- If you want a type meaning "any object", you probably want `Record<string, unknown>` instead.',
                  '- If you want a type meaning "any value", you probably want `unknown` instead.',
                ].join("\n"),
              },
              "{}": {
                message: [
                  '`{}` actually means "any non-nullish value".',
                  '- If you want a type meaning "any object", you probably want `Record<string, unknown>` instead.',
                  '- If you want a type meaning "any value", you probably want `unknown` instead.',
                ].join("\n"),
              },
              object: {
                message: [
                  "The `object` type is currently hard to use ([see this issue](https://github.com/microsoft/TypeScript/issues/21732)).",
                  "Consider using `Record<string, unknown>` instead, as it allows you to more easily inspect and use the keys.",
                ].join("\n"),
              },
            },
            extendDefaults: false,
          },
        ],
      },
    },
  ],
  plugins: ["@typescript-eslint"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
  root: true,
  settings: {
    "import/parsers": {
      "@typescript-eslint/parser": [".ts"],
    },
    "import/resolver": {
      typescript: {
        alwaysTryTypes: true,
      },
    },
  },
  reportUnusedDisableDirectives: true,
  ignorePatterns: ["dist", "coverage"],
};
