# Brand

The Billleaf mark is an **unfurling leaf**: a stem that curls into a spiral with two leaves opening from it, for growth, in hand-drawn organic strokes. The wordmark is lowercase **billleaf** in Inter 500, outlined to a path so it renders the same everywhere.

All sources and generated files live in [`packages/brand`](../../packages/brand).

## Colours

| Token       | Hex       | Use                                             |
| ----------- | --------- | ----------------------------------------------- |
| Brand green | `#15803D` | Stem, lower leaf, primary buttons (`--primary`) |
| Leaf green  | `#22A355` | Upper leaf, accents                             |
| Ink         | `#142B2B` | Wordmark on light backgrounds                   |
| Soft green  | `#F3FAF5` | Social image background                         |

**Dark mode** (handled by `LogoMark` under `.dark`): stem `#22A355`, upper leaf `#4ADE80`, lower leaf `#22A355`; the wordmark uses `currentColor` (white-ish foreground).

## Versions

| File (`packages/brand/src/svg`)  | When                                                       |
| -------------------------------- | ---------------------------------------------------------- |
| `mark.svg`                       | The mark, 33 px and up (veins visible)                     |
| `mark-small.svg`                 | 32 px and below: thicker stem, no veins (favicons, badges) |
| `mark-mono.svg`                  | One colour (`currentColor`): stamps, embossing, print      |
| `wordmark.svg`                   | The word alone (`currentColor`)                            |
| `lockup.svg` / `lockup-dark.svg` | Mark + wordmark for light / dark backgrounds               |

In React use `@workspace/brand/logo`: `<Logo height={32} />` (lockup) or `<LogoMark size={24} />`. `LogoMark` picks the small cut at 32 px and below by itself.

## Usage

- **Clear space:** at least half the mark's height on every side of the lockup.
- **Minimum size:** mark 16 px; lockup 20 px tall on screen, 8 mm in print.
- **Lockup proportions:** mark = 1.5 × the wordmark's height; gap = 0.28 × the wordmark's height. Don't re-space by hand; use the files or `Logo`.
- **Tiles:** installable icons (apple-touch, PWA, mobile app) put the mark on a white tile; browser favicons use the bare mark.
- **Don't:** recolour the leaves outside the palette, add outlines or shadows, rotate or stretch the mark, set the wordmark in another font or capitalise it, or put the colour mark on a busy photo (use the mono version).

## Generated files

`pnpm --filter @workspace/brand assets` regenerates everything from the SVG sources (commit the output):

| File (`packages/brand/assets`)                                         | Used for                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| `icon.svg`, `favicon.ico` (16/32/48)                                   | Browser tab icons (web, docs)                          |
| `apple-touch-icon.png` (180)                                           | iOS home screen                                        |
| `icon-192.png`, `icon-512.png`, `maskable-512.png`                     | Web app manifest (`apps/web/app/manifest.ts`)          |
| `og-image.png` (1200×630)                                              | Link previews (web marketing pages, docs)              |
| `email-logo.png` (320×84, shown at 160)                                | Email header, served from `WEB_URL/brand/`             |
| `app-icon-1024.png`, `adaptive-foreground-1024.png`, `splash-icon.png` | Reserved for the Expo app (adaptive background: white) |

The script also copies the files Next.js expects into `apps/web/app`, `apps/web/public/brand` and `apps/docs/app`.
