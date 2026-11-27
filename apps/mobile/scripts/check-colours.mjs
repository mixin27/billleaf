// Screens and components take colours from useTheme() (constants/theme.ts)
// so both themes and contrast stay right; a raw colour there is a bug.
// Runs with `pnpm --filter mobile test`.
import fs from "node:fs"
import path from "node:path"

const ROOTS = ["src/app", "src/components"]
const SKIP = new Set(["src/components/ui/icon-data.ts"])
const RAW = /["'](#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))["']/g

const files = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return files(p)
    return /\.(ts|tsx)$/.test(e.name) && !e.name.includes(".test.") ? [p] : []
  })

const found = ROOTS.flatMap(files)
  .filter((f) => !SKIP.has(f))
  .flatMap((f) =>
    fs
      .readFileSync(f, "utf8")
      .split("\n")
      .flatMap((line, i) =>
        [...line.matchAll(RAW)].map((m) => `  ${f}:${i + 1}  ${m[1]}`)
      )
  )

if (found.length) {
  console.error(
    `Raw colours found; use a token from useTheme():\n${found.join("\n")}`
  )
  process.exit(1)
}
console.log("✓ no raw colours in src/app or src/components")
