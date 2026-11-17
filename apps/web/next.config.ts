import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  // A separate build folder for the end-to-end run (apps/e2e), so it never
  // clashes with `next dev`'s .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@workspace/ui", "@workspace/brand"],
  poweredByHeader: false,
}

export default nextConfig
