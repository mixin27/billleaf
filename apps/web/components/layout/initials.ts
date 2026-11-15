/** "Acme Studio" → "AS", "kyaw" → "K". */
export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  return (
    parts
      .slice(0, 2)
      .map((p) => [...p][0]!.toUpperCase())
      .join("") || "?"
  )
}
