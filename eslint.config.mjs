// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import { includeIgnoreFile } from "@eslint/compat";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gitignorePath = path.resolve(__dirname, ".gitignore");
const gitExcludePath = path.resolve(__dirname, ".git", "info", "exclude");

export default tseslint.config(
  includeIgnoreFile(gitignorePath),
  includeIgnoreFile(gitExcludePath),
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
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
      "no-unexpected-multiline": "off", // conflicts with prettier
      "@typescript-eslint/no-unused-vars": ["error", { caughtErrors: "none" }],
    },
  },
);
