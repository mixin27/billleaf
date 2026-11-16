import { Logo } from "@workspace/brand/logo"
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"

import { appUrl } from "./shared"

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Logo height={24} />,
      url: "/docs",
    },
    links: [
      { text: "Pricing", url: `${appUrl}/pricing`, external: true },
      { text: "Open Billleaf", url: `${appUrl}/app`, external: true },
    ],
  }
}
