import { sql } from "drizzle-orm"
import {
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

import { id, timestamps } from "./_shared.js"
import { organization } from "./auth.js"
import { clients } from "./clients.js"
import { projects } from "./projects.js"
import { quotes } from "./quotes.js"

type PartySnapshot = {
  name: string
  legalName?: string | null
  email?: string | null
  phone?: string | null
  taxId?: string | null
  addressLines: string[]
}

/** Reusable contract text with {{merge.fields}}; copied into each contract. */
export const contractTemplates = pgTable(
  "contract_templates",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text().notNull(),
    body: text().notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.workspaceId, t.name)]
)

export const contracts = pgTable(
  "contracts",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    templateId: uuid().references(() => contractTemplates.id, {
      onDelete: "set null",
    }),
    quoteId: uuid().references(() => quotes.id, { onDelete: "set null" }),
    projectId: uuid().references(() => projects.id, { onDelete: "set null" }),
    /** Assigned when sent (gap-free per workspace); null while draft. */
    number: text(),
    status: text({ enum: ["draft", "sent", "signed", "declined", "void"] })
      .notNull()
      .default("draft"),
    title: text().notNull(),
    /** Source text with merge fields (editable while draft). */
    body: text().notNull(),
    /** Resolved text, frozen when sent. */
    renderedBody: text(),
    effectiveDate: date({ mode: "string" }),
    endDate: date({ mode: "string" }),
    clientSnapshot: jsonb().$type<PartySnapshot>(),
    issuerSnapshot: jsonb().$type<PartySnapshot>(),
    sentAt: timestamp({ withTimezone: true }),
    signedAt: date({ mode: "string" }),
    signedByName: text(),
    declinedAt: timestamp({ withTimezone: true }),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.workspaceId, t.number),
    index().on(t.workspaceId, t.id),
    index().on(t.workspaceId, t.status),
    index().on(t.clientId),
    index().on(t.quoteId),
    index().on(t.projectId),
    index("contracts_workspace_number_lower_idx").on(
      t.workspaceId,
      sql`lower(${t.number})`
    ),
  ]
)
