import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@workspace/ui", "@workspace/brand"],
  poweredByHeader: false,
}

export default nextConfig
