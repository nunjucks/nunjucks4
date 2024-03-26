/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest/presets/default-esm",
  extensionsToTreatAsEsm: [".ts"],
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/test/**/*.test.{js,ts}",
    "<rootDir>/packages/**/__tests__/**/*.{js,ts}",
    "<rootDir>/packages/**/*.{spec,test}.{js,ts}",
  ],
  testPathIgnorePatterns: ["/node_modules/"],
  globals: {
    "ts-jest": {
      useESM: true,
      isolatedModules: true,
    },
  },
  moduleNameMapper: {
    "^@nunjucks/(.*)$": "<rootDir>/packages/$1/src/index.ts",
  },
};
