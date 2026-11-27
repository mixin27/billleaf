import type { CashbookFilter } from "@workspace/contracts"

export type OptionKind = "categories" | "modes"

/** Same key roots as the mobile app (`apps/mobile/src/features/cashbook.ts`). */
export const cashbookKeys = {
  all: (ws: string | undefined) => ["cashbooks", ws] as const,
  list: (ws: string | undefined, archived: boolean) =>
    ["cashbooks", ws, "list", archived] as const,
  book: (ws: string | undefined, id: string) =>
    ["cashbooks", ws, "book", id] as const,
  entries: (
    ws: string | undefined,
    id: string,
    query: CashbookFilter & { page: number; pageSize: number }
  ) => ["cashbooks", ws, "book", id, "entries", query] as const,
  entry: (ws: string | undefined, id: string, entryId: string) =>
    ["cashbooks", ws, "book", id, "entry", entryId] as const,
  options: (ws: string | undefined, id: string, kind: OptionKind) =>
    ["cashbooks", ws, "book", id, kind] as const,
  members: (ws: string | undefined, id: string) =>
    ["cashbooks", ws, "book", id, "members"] as const,
  report: (ws: string | undefined, id: string, filter: CashbookFilter) =>
    ["cashbooks", ws, "book", id, "report", filter] as const,
}
