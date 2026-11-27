// Renders the tab bar icons from Hugeicons (the set the web app uses) to
// PNGs at 1x/2x/3x in assets/tab-icons. Native tabs take images, not React
// components; Android tints them with the tab colours. Run after changing
// ICONS: `pnpm --filter mobile tab-icons`, and commit the PNGs.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import * as icons from "@hugeicons/core-free-icons"
import sharp from "sharp"

/** Tab → Hugeicons name, matching the web sidebar (apps/web/config/nav.ts). */
const ICONS = {
  home: "DashboardSquare01Icon",
  time: "Clock01Icon",
  invoices: "Invoice01Icon",
  clients: "UserGroupIcon",
  money: "Wallet01Icon",
}

const SIZE = 24 // dp
const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../assets/tab-icons"
)
fs.mkdirSync(out, { recursive: true })

const attr = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
function svg(name) {
  const icon = icons[name]
  if (!icon) throw new Error(`No Hugeicon called ${name}`)
  const body = icon
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== "key")
        .map(
          ([k, v]) =>
            `${attr(k)}="${String(v).replace(/currentColor/g, "#000")}"`
        )
        .join(" ")
      return `<${tag} ${a}/>`
    })
    .join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">${body}</svg>`
}

for (const [tab, name] of Object.entries(ICONS)) {
  const src = Buffer.from(svg(name))
  for (const scale of [1, 2, 3]) {
    const file = path.join(out, `${tab}${scale > 1 ? `@${scale}x` : ""}.png`)
    await sharp(src, { density: 72 * scale })
      .resize(SIZE * scale, SIZE * scale)
      .png()
      .toFile(file)
  }
  console.log(`${tab}: ${name}`)
}
