/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  extensionsToTreatAsEsm: [".ts"],
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/test/**/*.test.{js,ts}",
    "<rootDir>/packages/**/__tests__/**/*.{js,ts}",
    "<rootDir>/packages/**/*.{spec,test}.{js,ts}",
  ],
  preset: "ts-jest/presets/js-with-ts",
  testPathIgnorePatterns: ["/node_modules/"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        isolatedModules: true,
        tsconfig: {
          allowJs: true,
        },
      },
    ],
  },
  transformIgnorePatterns: ["<rootDir>/node_modules/(?!character-entities)"],
  moduleNameMapper: {
    "^@nunjucks/(.*)$": "<rootDir>/packages/$1/src/index.ts",
    nunjucks: "<rootDir>/packages/core/src/index.ts",
  },
  collectCoverage: true,
  collectCoverageFrom: ["packages/**/src/**/*.ts"],
  coverageReporters: ["lcov", "json-summary"],
};
