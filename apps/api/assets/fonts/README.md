# PDF fonts

Embedded by `src/modules/documents/document-pdf.ts` so documents render any
client/business name, not just Latin-1.

| File                                | Covers                             |
| ----------------------------------- | ---------------------------------- |
| `NotoSans_{400Regular,700Bold}.ttf` | Latin, Greek, Cyrillic, Vietnamese |
| `NotoSansThai_*.ttf`                | Thai                               |
| `NotoSansMyanmar_*.ttf`             | Burmese (Myanmar)                  |

Source: Google Noto fonts (via `@expo-google-fonts/*` 0.4.2). Licensed under the
SIL Open Font License 1.1 — see `OFL.txt`. To add a script, add its
Regular/Bold TTFs here and a range + font entry in `document-pdf.ts`.

## Chinese, Japanese, Korean

Not stored here: each is 4–9 MB. `src/modules/documents/cjk-fonts.ts` downloads
the one a document needs on first use — Noto Sans CJK `Sans2.004` SubsetOTF
(SC, TC, JP, KR; Regular and Bold; OFL-1.1) from
`raw.githubusercontent.com/notofonts/noto-cjk`, pinned by SHA-256 — and caches
it in `PDF_FONT_CACHE_DIR` (a `pdffonts` volume in production). Kana → JP,
Hangul → KR; Chinese characters alone follow the workspace locale
(zh-TW/HK → TC, else SC). Offline, those characters render as boxes and a
warning is logged. Pre-fetch with `pnpm --filter api fonts:cjk` or
`node dist/fetch-cjk-fonts.js` in the container.
