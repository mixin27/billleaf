import { config } from "@workspace/eslint-config/react-internal"

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  {
    languageOptions: {
      globals: {
        __DEV__: "readonly",
        process: "readonly",
        require: "readonly",
      },
    },
  },
  {
    ignores: [
      ".expo/**",
      "ios/**",
      "android/**",
      "metro.config.js",
      "app.config.js",
      "expo-env.d.ts",
    ],
  },
]
