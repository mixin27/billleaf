import { parseSort } from "@workspace/contracts"
import { type AnyColumn, sql, type SQL, type SQLWrapper } from "drizzle-orm"

/**
 * ORDER BY for `?sort=field:dir`, using only the given column map (the
 * contract schema already rejects unknown fields). Nulls sort last either
 * way, and `tiebreak` (the id) keeps pages stable.
 */
export function orderBy(
  sort: string | undefined,
  columns: Record<string, SQLWrapper>,
  tiebreak: AnyColumn,
  fallback: SQL[] = [sql`${tiebreak} desc`]
): SQL[] {
  const s = parseSort(sort)
  const col = s ? columns[s.field] : undefined
  if (!s || !col) return fallback
  return [
    s.dir === "asc" ? sql`${col} asc nulls last` : sql`${col} desc nulls last`,
    sql`${tiebreak} desc`,
  ]
}

export const offsetOf = (page: number, pageSize: number) =>
  (page - 1) * pageSize

export interface PageArgs {
  page: number
  pageSize: number
  sort?: string
}
