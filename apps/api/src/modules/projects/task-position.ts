const STEP = 1024
const MIN_GAP = 1e-6

/**
 * Position for an item placed right after `afterId` (null = first) in an
 * ordered column. Returns null when neighbours are too close and the column
 * should be renumbered first.
 */
export function positionAfter(
  column: { id: string; position: number }[],
  afterId: string | null,
  excludeId?: string
): number | null {
  const cols = column.filter((c) => c.id !== excludeId)
  if (cols.length === 0) return STEP
  if (afterId === null) return cols[0]!.position - STEP
  const idx = cols.findIndex((c) => c.id === afterId)
  if (idx === -1) return cols[cols.length - 1]!.position + STEP
  const prev = cols[idx]!.position
  const next = cols[idx + 1]?.position
  if (next === undefined) return prev + STEP
  if (next - prev < MIN_GAP) return null
  return (prev + next) / 2
}

/** Evenly spaced positions for a renumbered column. */
export function renumber<T extends { id: string }>(
  column: T[]
): { id: string; position: number }[] {
  return column.map((c, i) => ({ id: c.id, position: (i + 1) * STEP }))
}
