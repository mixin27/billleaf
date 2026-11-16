import type * as React from "react"

import { WORDMARK } from "./paths"

export const BRAND_GREEN = "#15803D"
export const BRAND_LEAF = "#22A355"
export const BRAND_INK = "#142B2B"

const STEM =
  "M40 132 C40 104 44 84 54 66 C66 46 88 40 98 54 C106 66 98 80 86 80 C76 80 72 70 78 64"

/**
 * Brighter greens on dark backgrounds (`.dark` on any ancestor, as set by
 * next-themes and Fumadocs). Inline so the component needs no CSS file.
 */
const DARK_STYLE =
  ".dark .bl-stem{stroke:#22A355}.dark .bl-leaf1{fill:#4ADE80}.dark .bl-leaf2{fill:#22A355}.dark .bl-vein{stroke:#0F1A1A}"

/**
 * The unfurling-leaf mark (transparent). Sizes ≤ 32px use a bolder cut
 * without veins so it stays legible as a favicon.
 */
export function LogoMark({
  size = 32,
  title = "billleaf",
  ...props
}: { size?: number; title?: string } & Omit<
  React.SVGProps<SVGSVGElement>,
  "width" | "height" | "viewBox"
>) {
  const small = size <= 32
  return (
    <svg
      viewBox={small ? "10 20 116 116" : "8 20 120 120"}
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      <style>{DARK_STYLE}</style>
      <path
        className="bl-stem"
        d={STEM}
        fill="none"
        stroke={BRAND_GREEN}
        strokeWidth={small ? 10 : 7}
        strokeLinecap="round"
      />
      {small ? (
        <>
          <path
            className="bl-leaf1"
            d="M50 76 C32 70 18 54 18 36 C18 28 22 22 30 22 C46 32 54 52 50 76Z"
            fill={BRAND_LEAF}
          />
          <path
            className="bl-leaf2"
            d="M42 108 C56 116 82 117 100 106 C108 101 114 92 115 86 C94 82 66 88 50 100 C46 102 44 105 42 108Z"
            fill={BRAND_GREEN}
          />
        </>
      ) : (
        <>
          <path
            className="bl-leaf1"
            d="M50 74 C34 68 22 54 22 38 C22 30 26 26 32 26 C46 34 52 52 50 74Z"
            fill={BRAND_LEAF}
          />
          <path
            className="bl-vein"
            d="M49 70 C46 58 40 46 31 33"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            className="bl-leaf2"
            d="M42 106 C56 113 80 114 98 104 C106 99 111 92 112 87 C92 84 66 89 51 99 C47 101 44 103 42 106Z"
            fill={BRAND_GREEN}
          />
          <path
            className="bl-vein"
            d="M45 105 C62 101 84 95 107 89"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  )
}

/**
 * Mark + "billleaf" wordmark. The wordmark uses `currentColor`, so it
 * follows the text colour (ink in light mode, white in dark mode).
 * `height` is the mark's size in px.
 */
export function Logo({
  height = 32,
  className,
}: {
  height?: number
  className?: string
}) {
  const wordHeight = height / 1.5
  const wordWidth = (WORDMARK.width / WORDMARK.height) * wordHeight
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: wordHeight * 0.28,
      }}
    >
      <LogoMark size={height} title="" />
      <svg
        viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}
        width={wordWidth}
        height={wordHeight}
        role="img"
        aria-label="billleaf"
      >
        <path d={WORDMARK.d} fill="currentColor" />
      </svg>
    </span>
  )
}
