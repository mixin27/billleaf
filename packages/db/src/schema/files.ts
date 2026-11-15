import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core"

import { id, timestamps } from "./_shared.js"
import { organization, user } from "./auth.js"

/** Metadata for objects in S3-compatible storage. Bytes live in the bucket under `key`. */
export const files = pgTable(
  "files",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** `<workspaceId>/<purpose>/<uuid>.<ext>` */
    key: text().notNull().unique(),
    purpose: text({ enum: ["logo", "attachment"] }).notNull(),
    filename: text().notNull(),
    contentType: text().notNull(),
    size: integer().notNull(),
    createdBy: uuid().references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index().on(t.workspaceId, t.purpose)]
)
