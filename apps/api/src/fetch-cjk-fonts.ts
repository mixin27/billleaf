/**
 * Pre-fetch every Chinese/Japanese/Korean PDF font into the cache
 * (`PDF_FONT_CACHE_DIR`), so the first such PDF doesn't wait on a download.
 *
 *   pnpm --filter api fonts:cjk            (development)
 *   node dist/fetch-cjk-fonts.js           (in the API container)
 */
import {
  CJK_FONTS,
  type CjkLang,
  cjkFonts,
} from "./modules/documents/cjk-fonts.js"

let failed = 0
for (const lang of Object.keys(CJK_FONTS) as CjkLang[]) {
  const fonts = await cjkFonts(lang)
  console.log(`${lang}: ${fonts ? "ready" : "FAILED"}`)
  if (!fonts) failed++
}
process.exit(failed ? 1 : 0)
