/** Conventional commits: feat|fix|docs|chore|refactor|test|ci|perf|build(scope): subject */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      1,
      "always",
      [
        "web",
        "api",
        "mobile",
        "docs",
        "ui",
        "db",
        "contracts",
        "api-client",
        "env",
        "emails",
        "infra",
        "ci",
        "deps",
        "repo",
      ],
    ],
  },
}
