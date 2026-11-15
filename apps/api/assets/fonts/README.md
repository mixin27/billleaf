# PDF fonts

Embedded by `src/modules/documents/document-pdf.ts` so documents render any
client/business name, not just Latin-1.

| File                                | Covers                             |
| ----------------------------------- | ---------------------------------- |
| `NotoSans_{400Regular,700Bold}.ttf` | Latin, Greek, Cyrillic, Vietnamese |
| `NotoSansThai_*.ttf`                | Thai                               |
| `NotoSansMyanmar_*.ttf`             | Burmese (Myanmar)                  |

Source: Google Noto fonts (via `@expo-google-fonts/*` 0.4.2). Licensed under the
SIL Open Font License 1.1 — see `OFL.txt`. To add a script (e.g. CJK), add its
Regular/Bold TTFs here and a range + font entry in `document-pdf.ts`.
