import swc from "unplugin-swc"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    root: "./",
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
  },
  // SWC emits decorator metadata, which Nest DI needs (esbuild does not).
  plugins: [swc.vite({ module: { type: "es6" } })],
})
