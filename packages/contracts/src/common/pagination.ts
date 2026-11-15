import { z } from "zod"

/** Page sizes offered by data tables (the API accepts 1–100). */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25

/** Numbered pages: `?page=2&pageSize=25`. */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
})
export type PageQuery = z.input<typeof pageQuerySchema>

export type SortDirection = "asc" | "desc"

/**
 * `?sort=field:asc|desc`, restricted to the resource's sortable fields so
 * clients can't order by arbitrary columns (invalid → 422).
 */
export function sortQuery<const F extends readonly [string, ...string[]]>(
  fields: F
) {
  return z
    .string()
    .regex(/^[A-Za-z]+:(asc|desc)$/, "Use field:asc or field:desc")
    .refine((v) => (fields as readonly string[]).includes(v.split(":")[0]!), {
      message: `Sort by one of: ${fields.join(", ")}`,
    })
    .optional()
}

/** Parse `field:dir` (already validated by `sortQuery`). */
export function parseSort(
  sort: string | undefined | null
): { field: string; dir: SortDirection } | null {
  if (!sort) return null
  const [field, dir] = sort.split(":")
  return field && (dir === "asc" || dir === "desc") ? { field, dir } : null
}

/** One page of results plus the total across all pages. */
export function paged<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
