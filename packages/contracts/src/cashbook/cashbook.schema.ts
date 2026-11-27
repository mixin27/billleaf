import { z } from "zod"

import { optionalText } from "../common/locale.js"
import { currencyCodeSchema } from "../common/money.js"
import { paged, pageQuerySchema } from "../common/pagination.js"

/**
 * Cashbooks: a running balance of money in and out, kept apart from
 * expenses and payments (ADR-0019). Each book has its own currency and
 * its own members. Amounts are positive minor units; `type` says whether
 * money came in or went out.
 */

// ── Roles ────────────────────────────────────────────────────────────────

export const cashbookRoleSchema = z.enum([
  "owner",
  "admin",
  "operator",
  "viewer",
])
export type CashbookRole = z.infer<typeof cashbookRoleSchema>

export const CASHBOOK_ROLES: Record<
  CashbookRole,
  { label: string; description: string }
> = {
  owner: {
    label: "Owner",
    description: "Everything, including members and deleting the book.",
  },
  admin: {
    label: "Admin",
    description: "Add, edit and delete any entry; manage categories and modes.",
  },
  operator: {
    label: "Operator",
    description:
      "Add entries, and edit or delete their own for 24 hours. Sees the whole book.",
  },
  viewer: {
    label: "Viewer",
    description: "See entries and reports; can't change anything.",
  },
}

/** How long an operator can still change their own entry. */
export const OPERATOR_EDIT_WINDOW_HOURS = 24

const RANK: Record<CashbookRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
  owner: 3,
}

/** True when `role` is at least `min`. */
export function cashbookRoleAtLeast(
  role: CashbookRole | null | undefined,
  min: CashbookRole
): boolean {
  return role ? RANK[role] >= RANK[min] : false
}

// ── Books ────────────────────────────────────────────────────────────────

/** Optional entry fields shown for a book (CashBook's "entry fields"). */
export const cashbookFieldsSchema = z.object({
  contact: z.boolean(),
  category: z.boolean(),
  mode: z.boolean(),
})
export type CashbookFields = z.infer<typeof cashbookFieldsSchema>

export const cashbookSchema = z.object({
  id: z.string(),
  name: z.string(),
  currency: z.string(),
  fields: cashbookFieldsSchema,
  archivedAt: z.iso.datetime().nullable(),
  /** Your role in this book (`owner` when you manage every book). */
  role: cashbookRoleSchema,
  /** All entries, in minus out (minor units). */
  balance: z.number().int(),
  totalIn: z.number().int(),
  totalOut: z.number().int(),
  entryCount: z.number().int(),
  memberCount: z.number().int(),
  /** Last time an entry was added or changed. */
  lastActivityAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})
export type Cashbook = z.infer<typeof cashbookSchema>

export const cashbookListSchema = z.object({ items: z.array(cashbookSchema) })
export type CashbookList = z.infer<typeof cashbookListSchema>

export const listCashbooksQuerySchema = z.object({
  archived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
})
export type ListCashbooksQuery = z.input<typeof listCashbooksQuerySchema>

export const createCashbookSchema = z.object({
  name: z.string().trim().min(1, "Give the book a name").max(80),
  /** Defaults to the workspace currency. */
  currency: currencyCodeSchema.optional(),
  fields: cashbookFieldsSchema.partial().optional(),
})
export type CreateCashbookInput = z.input<typeof createCashbookSchema>

export const updateCashbookSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    /** Only while the book has no entries. */
    currency: currencyCodeSchema,
    fields: cashbookFieldsSchema.partial(),
    archived: z.boolean(),
  })
  .partial()
export type UpdateCashbookInput = z.input<typeof updateCashbookSchema>

// ── Members ──────────────────────────────────────────────────────────────

export const cashbookMemberSchema = z.object({
  /** Workspace member id. */
  memberId: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  role: cashbookRoleSchema,
})
export type CashbookMember = z.infer<typeof cashbookMemberSchema>

export const cashbookMemberListSchema = z.object({
  items: z.array(cashbookMemberSchema),
})

export const addCashbookMemberSchema = z.object({
  memberId: z.uuid(),
  role: cashbookRoleSchema,
})
export type AddCashbookMemberInput = z.input<typeof addCashbookMemberSchema>

export const updateCashbookMemberSchema = z.object({ role: cashbookRoleSchema })
export type UpdateCashbookMemberInput = z.input<
  typeof updateCashbookMemberSchema
>

// ── Categories and payment modes ─────────────────────────────────────────

/** Modes every new book starts with. */
export const DEFAULT_CASHBOOK_MODES = ["Cash", "Online"] as const

export const cashbookOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  archived: z.boolean(),
})
export type CashbookOption = z.infer<typeof cashbookOptionSchema>

export const cashbookOptionListSchema = z.object({
  items: z.array(cashbookOptionSchema),
})

export const saveCashbookOptionSchema = z.object({
  name: z.string().trim().min(1, "Required").max(60),
  archived: z.boolean().optional(),
})
export type SaveCashbookOptionInput = z.input<typeof saveCashbookOptionSchema>

// ── Entries ──────────────────────────────────────────────────────────────

export const cashbookEntryTypeSchema = z.enum(["in", "out"])
export type CashbookEntryType = z.infer<typeof cashbookEntryTypeSchema>

const isoDate = z.iso.date()
/** 24-hour "HH:MM". */
const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)")

/** Per file, photos or PDFs. */
export const CASHBOOK_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
export const CASHBOOK_MAX_ATTACHMENTS = 5

export const cashbookAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int(),
  /** Short-lived link. */
  url: z.string(),
})
export type CashbookAttachment = z.infer<typeof cashbookAttachmentSchema>

export const cashbookEntrySchema = z.object({
  id: z.string(),
  bookId: z.string(),
  type: cashbookEntryTypeSchema,
  amount: z.number().int(),
  entryDate: isoDate,
  entryTime: clockTime,
  remark: z.string().nullable(),
  contactName: z.string().nullable(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  modeId: z.string().nullable(),
  modeName: z.string().nullable(),
  /** Balance of the book right after this entry. */
  balance: z.number().int(),
  createdBy: z
    .object({
      memberId: z.string(),
      name: z.string(),
      /** You added it. */
      you: z.boolean(),
    })
    .nullable(),
  /** True when you can edit or delete it. */
  editable: z.boolean(),
  edited: z.boolean(),
  attachments: z.array(cashbookAttachmentSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type CashbookEntry = z.infer<typeof cashbookEntrySchema>

const entryFields = {
  type: cashbookEntryTypeSchema,
  /** Minor units of the book's currency. */
  amount: z.number().int().positive().max(1_000_000_000_00),
  /** Defaults to today in the workspace timezone. */
  entryDate: isoDate.optional(),
  /** Defaults to now in the workspace timezone. */
  entryTime: clockTime.optional(),
  remark: optionalText(500),
  contactName: optionalText(120),
  categoryId: z.uuid().nullish(),
  modeId: z.uuid().nullish(),
}

export const createCashbookEntrySchema = z.object(entryFields)
export type CreateCashbookEntryInput = z.input<typeof createCashbookEntrySchema>

export const updateCashbookEntrySchema = z
  .object({
    ...entryFields,
    entryDate: isoDate,
    entryTime: clockTime,
  })
  .partial()
export type UpdateCashbookEntryInput = z.input<typeof updateCashbookEntrySchema>

/** Filters shared by the entry list, CSV export and reports. */
export const cashbookFilterSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  type: cashbookEntryTypeSchema.optional(),
  categoryId: z.uuid().optional(),
  modeId: z.uuid().optional(),
  memberId: z.uuid().optional(),
  /** Matches remark or contact, or the amount when it's a number. */
  q: z.string().trim().max(100).optional(),
})
export type CashbookFilter = z.input<typeof cashbookFilterSchema>

export const listCashbookEntriesQuerySchema = pageQuerySchema
  .extend(cashbookFilterSchema.shape)
  .extend({
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })
export type ListCashbookEntriesQuery = z.input<
  typeof listCashbookEntriesQuerySchema
>

const totals = z.object({
  totalIn: z.number().int(),
  totalOut: z.number().int(),
  /** In minus out, for the filtered entries. */
  net: z.number().int(),
})

export const cashbookEntryListSchema = paged(cashbookEntrySchema).extend({
  /** Totals of every entry matching the filters, across all pages. */
  totals,
})
export type CashbookEntryList = z.infer<typeof cashbookEntryListSchema>

/** Move or copy entries to another book (same currency). */
export const transferCashbookEntriesSchema = z.object({
  entryIds: z.array(z.uuid()).min(1).max(500),
  toBookId: z.uuid(),
  mode: z.enum(["move", "copy"]),
})
export type TransferCashbookEntriesInput = z.input<
  typeof transferCashbookEntriesSchema
>

export const deleteCashbookEntriesSchema = z.object({
  entryIds: z.array(z.uuid()).min(1).max(500),
})

/** What happened to an entry, newest first (from the audit log). */
export const cashbookEntryActivitySchema = z.object({
  items: z.array(
    z.object({
      action: z.enum(["created", "updated", "deleted", "moved", "copied"]),
      at: z.iso.datetime(),
      by: z.string().nullable(),
      /** Field → [before, after], for updates. */
      changes: z.record(z.string(), z.tuple([z.unknown(), z.unknown()])),
    })
  ),
})
export type CashbookEntryActivity = z.infer<typeof cashbookEntryActivitySchema>

// ── Reports ──────────────────────────────────────────────────────────────

const inOut = {
  totalIn: z.number().int(),
  totalOut: z.number().int(),
}

export const cashbookReportSchema = z.object({
  from: isoDate.nullable(),
  to: isoDate.nullable(),
  currency: z.string(),
  /** Balance before `from` (0 when there's no start date). */
  openingBalance: z.number().int(),
  ...inOut,
  closingBalance: z.number().int(),
  byDay: z.array(
    z.object({ date: isoDate, ...inOut, balance: z.number().int() })
  ),
  byCategory: z.array(
    z.object({ id: z.string().nullable(), name: z.string(), ...inOut })
  ),
  byMode: z.array(
    z.object({ id: z.string().nullable(), name: z.string(), ...inOut })
  ),
})
export type CashbookReport = z.infer<typeof cashbookReportSchema>

export const cashbookReportQuerySchema = cashbookFilterSchema
export type CashbookReportQuery = z.input<typeof cashbookReportQuerySchema>

// ── Import (from the CashBook app's CSV export) ──────────────────────────

/** Largest CSV accepted for an import. */
export const CASHBOOK_IMPORT_MAX_BYTES = 5 * 1024 * 1024

export const cashbookImportQuerySchema = z.object({
  /** "true" previews without writing anything. */
  dryRun: z.enum(["true", "false"]).optional(),
})
export type CashbookImportQuery = z.input<typeof cashbookImportQuerySchema>

export const cashbookImportResultSchema = z.object({
  dryRun: z.boolean(),
  /** Entry rows in the file. */
  rows: z.number().int(),
  /** New entries (added, or to add on a dry run). */
  added: z.number().int(),
  /** Rows already imported before (same row in a file imported earlier). */
  duplicates: z.number().int(),
  /** Rows that couldn't be read, with their line in the file. */
  invalid: z.array(z.object({ line: z.number().int(), message: z.string() })),
  /** Dates of the rows in the file. */
  from: isoDate.nullable(),
  to: isoDate.nullable(),
  /** Totals of the new entries (minor units). */
  totalIn: z.number().int(),
  totalOut: z.number().int(),
  /** The book's balance before and after the import. */
  balanceBefore: z.number().int(),
  balanceAfter: z.number().int(),
  /**
   * The file's own Balance column: the balance before its first row
   * (non-zero when the export starts mid-book) and after its last row.
   */
  fileOpeningBalance: z.number().int().nullable(),
  fileClosingBalance: z.number().int().nullable(),
  /** Payment modes and categories that will be created (or were). */
  newModes: z.array(z.string()),
  newCategories: z.array(z.string()),
  /** "Entry by" names with no book member of that name: added as you. */
  unmatchedPeople: z.array(z.string()),
})
export type CashbookImportResult = z.infer<typeof cashbookImportResultSchema>
