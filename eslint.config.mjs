import js from "@eslint/js";
import nodePlugin from "eslint-plugin-n";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "release/**",
      "build/**",
      "dist/**",
      "tests/__snapshots__/**",
      "test-results/**",
      "playwright-report/**",
      "electron/preload.cjs"
    ]
  },
  js.configs.recommended,
  prettier,
  {
    files: ["electron/**/*.cjs", "src/shared/**/*.cjs", "scripts/**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node
      }
    },
    plugins: { n: nodePlugin },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-implicit-globals": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-assignment": "off",
      "prefer-const": "warn",
      eqeqeq: ["error", "smart"],
      curly: ["warn", "multi-line"],
      "eol-last": "error",
      "no-console": "off"
    }
  },
  {
    files: ["src/renderer/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        quickButtonApi: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-implicit-globals": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "prefer-const": "warn",
      eqeqeq: ["error", "smart"],
      curly: ["warn", "multi-line"],
      "eol-last": "error",
      "no-console": "off"
    }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  }
];
