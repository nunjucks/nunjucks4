/* eslint-disable */
module.exports = {
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:prettier/recommended",
  ],
  "rules": {
    "@typescript-eslint/camelcase": "off",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-var-requires": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/ban-types": [
      "error",
      {
        "types": {
          String: {
              message: 'Use string instead',
              fixWith: 'string',
          },
          Boolean: {
              message: 'Use boolean instead',
              fixWith: 'boolean',
          },
          Number: {
              message: 'Use number instead',
              fixWith: 'number',
          },
          Symbol: {
              message: 'Use symbol instead',
              fixWith: 'symbol',
          },
          // object typing
          Object: {
              message: [
                  'The `Object` type actually means "any non-nullish value", so it is marginally better than `unknown`.',
                  '- If you want a type meaning "any object", you probably want `Record<string, unknown>` instead.',
                  '- If you want a type meaning "any value", you probably want `unknown` instead.',
              ].join('\n'),
          },
          '{}': {
              message: [
                  '`{}` actually means "any non-nullish value".',
                  '- If you want a type meaning "any object", you probably want `Record<string, unknown>` instead.',
                  '- If you want a type meaning "any value", you probably want `unknown` instead.',
              ].join('\n'),
          },
          object: {
              message: [
                  'The `object` type is currently hard to use ([see this issue](https://github.com/microsoft/TypeScript/issues/21732)).',
                  'Consider using `Record<string, unknown>` instead, as it allows you to more easily inspect and use the keys.',
              ].join('\n'),
          },
        },
        extendDefaults: false,
      }
    ]
  },
  "overrides": [
    {
      // enable these rules specifically for TypeScript files
      "files": ["*.ts", "*.tsx"],
      "extends": [
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:prettier/recommended"
      ],
      "rules": {
        "@typescript-eslint/camelcase": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
      }
    },
    {
      "files": ["*.js"],
      "parser": "espree",
      "parserOptions": {
        "sourceType": "module",
        "ecmaVersion": 2018
      },
      "env": {
        "node": true,
        "es6": true
      }
    },
    {
      "files": ["rollup.config.js"],
      "env": {
        "node": true
      }
    },
    {
      "files": ["**/gen/types.ts"],
      "rules": {
        "@typescript-eslint/no-namespace": "off"
      }
    },
    {
      "files": ["*.test.ts", "*.test.tsx"],
      "rules": {
        "@typescript-eslint/no-explicit-any": "off"
      }
    }
  ],
};
