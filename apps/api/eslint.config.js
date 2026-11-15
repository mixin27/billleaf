import { config } from "@workspace/eslint-config/base"

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  {
    // Nest relies on decorators; the babel parser needs the plugin enabled.
    languageOptions: {
      parserOptions: {
        babelOptions: {
          plugins: [["@babel/plugin-syntax-decorators", { version: "legacy" }]],
        },
      },
    },
  },
]
