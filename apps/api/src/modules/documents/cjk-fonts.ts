import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Logger } from "@nestjs/common"

/**
 * Chinese, Japanese and Korean fonts for PDFs, fetched on first use.
 *
 * Each font is 4–9 MB, so they aren't bundled: the first document with CJK
 * text downloads the one it needs from a pinned Noto Sans CJK release
 * (OFL-1.1), checks its SHA-256, and caches it on disk (and in memory).
 * PDFs embed only the glyphs they use. If a font can't be fetched, the PDF
 * still renders (those characters show as boxes) and a warning is logged.
 *
 * `PDF_FONT_CACHE_DIR` sets the cache folder (default: the OS temp dir);
 * `pnpm --filter api fonts:cjk` pre-fetches all of them.
 */
export type CjkLang = "sc" | "tc" | "jp" | "kr"

const RELEASE =
  "https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004/Sans/SubsetOTF"

export const CJK_FONTS: Record<
  CjkLang,
  Record<"regular" | "bold", { file: string; sha256: string; bytes: number }>
> = {
  sc: {
    regular: {
      file: "SC/NotoSansSC-Regular.otf",
      sha256:
        "faa6c9df652116dde789d351359f3d7e5d2285a2b2a1f04a2d7244df706d5ea9",
      bytes: 8_331_336,
    },
    bold: {
      file: "SC/NotoSansSC-Bold.otf",
      sha256:
        "c6cb5a93abaa9edc8ee7463b7ebb7f42d618d40e6ed2f7a5371c97b0b64767c0",
      bytes: 8_543_168,
    },
  },
  tc: {
    regular: {
      file: "TC/NotoSansTC-Regular.otf",
      sha256:
        "5bab0cb3c1cf89dde07c4a95a4054b195afbcfe784d69d75c340780712237537",
      bytes: 5_683_368,
    },
    bold: {
      file: "TC/NotoSansTC-Bold.otf",
      sha256:
        "55420b259eb119bf5f2a0aadba10cf9d736c12d64ab93e78546d69ef5f43558b",
      bytes: 5_839_972,
    },
  },
  jp: {
    regular: {
      file: "JP/NotoSansJP-Regular.otf",
      sha256:
        "dff723ba59d57d136764a04b9b2d03205544f7cd785a711442d6d2d085ac5073",
      bytes: 4_533_028,
    },
    bold: {
      file: "JP/NotoSansJP-Bold.otf",
      sha256:
        "1b0edfb500b73a4fa8a4fcaae1bbbd403994e08e73e3e0da37e70d3853f42c5f",
      bytes: 4_656_448,
    },
  },
  kr: {
    regular: {
      file: "KR/NotoSansKR-Regular.otf",
      sha256:
        "69975a0ac8472717870aefeab0a4d52739308d90856b9955313b2ad5e0148d68",
      bytes: 4_644_748,
    },
    bold: {
      file: "KR/NotoSansKR-Bold.otf",
      sha256:
        "5a6ceb287ed2fc6cfc6213144ebea68cbd94b20fc9eb873d8486493bf02d9bda",
      bytes: 4_816_044,
    },
  },
}

// Han ideographs, CJK symbols/punctuation, fullwidth forms, kana, Hangul, Bopomofo.
export const CJK =
  /[⺀-⿟　-〿぀-ヿ㄀-ㄯ㄰-㆏ㆠ-ㇿ㈀-㏿㐀-䶿一-鿿ꥠ-꥿가-힯ힰ-퟿豈-﫿︰-﹏＀-￯]|[\u{20000}-\u{3134F}]/u
const KANA = /[぀-ヿㇰ-ㇿ]/
const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-퟿]/
const BOPOMOFO = /[㄀-ㄯㆠ-ㆿ]/

/**
 * Which CJK font a document needs, or null if it has no CJK text. Kana
 * means Japanese and Hangul Korean; Chinese characters alone follow the
 * locale (zh-TW/HK/Hant → Traditional, ja → Japanese, ko → Korean, else
 * Simplified).
 */
export function cjkLangFor(text: string, locale = ""): CjkLang | null {
  if (!CJK.test(text)) return null
  const kana = KANA.test(text)
  const hangul = HANGUL.test(text)
  if (kana && !hangul) return "jp"
  if (hangul && !kana) return "kr"
  if (BOPOMOFO.test(text)) return "tc"
  const l = locale.toLowerCase()
  if (l.startsWith("ja")) return "jp"
  if (l.startsWith("ko")) return "kr"
  if (/^zh-(tw|hk|mo)|hant/.test(l)) return "tc"
  return "sc"
}

const logger = new Logger("PdfFonts")
const memory = new Map<string, Promise<Buffer | null>>()

function cacheDir() {
  return process.env.PDF_FONT_CACHE_DIR || join(tmpdir(), "billleaf-fonts")
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex")

async function load(spec: { file: string; sha256: string }): Promise<Buffer> {
  const dir = cacheDir()
  const path = join(dir, spec.file.replace("/", "-"))
  try {
    const cached = await readFile(path)
    if (sha256(cached) === spec.sha256) return cached
  } catch {
    // not cached yet
  }
  const res = await fetch(`${RELEASE}/${spec.file}`, {
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = Buffer.from(await res.arrayBuffer())
  if (sha256(data) !== spec.sha256)
    throw new Error("checksum mismatch (refusing to use it)")
  await mkdir(dir, { recursive: true })
  // Write then rename, so a crash never leaves half a font in the cache.
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, path)
  return data
}

/**
 * Regular and bold fonts for `lang`, or null when they can't be had (the
 * caller renders without them). Concurrent callers share one download.
 */
export async function cjkFonts(
  lang: CjkLang
): Promise<{ regular: Buffer; bold: Buffer } | null> {
  const get = (w: "regular" | "bold") => {
    const spec = CJK_FONTS[lang][w]
    let p = memory.get(spec.file)
    if (!p) {
      p = load(spec).catch((err: Error) => {
        logger.warn(
          `CJK font ${spec.file} unavailable (${err.message}); rendering without it`
        )
        memory.delete(spec.file) // try again next time
        return null
      })
      memory.set(spec.file, p)
    }
    return p
  }
  const [regular, bold] = await Promise.all([get("regular"), get("bold")])
  if (!regular) return null
  return { regular, bold: bold ?? regular }
}
