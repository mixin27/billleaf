import { z } from "zod"

import { currencyCodeSchema } from "../common/money.js"
import { paged, pageQuerySchema, sortQuery } from "../common/pagination.js"

/**
 * Expenses: money the business spent. `amount` is the total paid in minor
 * units, tax included; `taxAmount` is the tax part of it (for the tax
 * summary). Billable expenses can be put on the client's next invoice.
 */

export const expensePaymentMethodSchema = z.enum([
  "bank_transfer",
  "card",
  "cash",
  "mobile_wallet",
  "other",
])
export type ExpensePaymentMethod = z.infer<typeof expensePaymentMethodSchema>
export const EXPENSE_PAYMENT_METHOD_LABELS: Record<
  ExpensePaymentMethod,
  string
> = {
  bank_transfer: "Bank transfer",
  card: "Card",
  cash: "Cash",
  mobile_wallet: "Mobile wallet",
  other: "Other",
}

/** Created for a workspace the first time it lists categories. */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Software & subscriptions",
  "Equipment",
  "Office & supplies",
  "Internet & phone",
  "Travel",
  "Meals",
  "Professional services",
  "Advertising & marketing",
  "Bank & payment fees",
  "Other",
] as const

export const expenseCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  archived: z.boolean(),
})
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>

export const expenseCategoryListSchema = z.object({
  items: z.array(expenseCategorySchema),
})

export const saveExpenseCategorySchema = z.object({
  name: z.string().trim().min(1, "Required").max(80),
  archived: z.boolean().optional(),
})
export type SaveExpenseCategoryInput = z.input<typeof saveExpenseCategorySchema>

/** Receipt files: photos (PNG/JPEG) or PDFs. */
export const EXPENSE_RECEIPT_MAX_BYTES = 5 * 1024 * 1024

export const expenseSchema = z.object({
  id: z.string(),
  spentOn: z.iso.date(),
  vendor: z.string().nullable(),
  description: z.string().nullable(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  amount: z.number().int(),
  taxAmount: z.number().int(),
  currency: z.string(),
  paymentMethod: expensePaymentMethodSchema,
  reference: z.string().nullable(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  billable: z.boolean(),
  invoiceId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  receipt: z
    .object({
      filename: z.string(),
      contentType: z.string(),
      /** Short-lived link to view it. */
      url: z.string(),
    })
    .nullable(),
  createdAt: z.iso.datetime(),
})
export type Expense = z.infer<typeof expenseSchema>

const optionalId = z
  .uuid()
  .nullish()
  .transform((v) => v ?? null)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null)

const expenseFields = {
  spentOn: z.iso.date(),
  vendor: optionalText(200),
  description: optionalText(1000),
  categoryId: optionalId,
  amount: z.number().int().min(1, "Enter the amount").max(10_000_000_000),
  taxAmount: z.number().int().min(0).default(0),
  /** Defaults to the client's currency, else the workspace default. */
  currency: currencyCodeSchema.optional(),
  paymentMethod: expensePaymentMethodSchema.default("bank_transfer"),
  reference: optionalText(200),
  clientId: optionalId,
  projectId: optionalId,
  billable: z.boolean().default(false),
}

const taxWithinAmount = (v: { amount?: number; taxAmount?: number }) =>
  v.amount === undefined || (v.taxAmount ?? 0) <= v.amount

export const createExpenseSchema = z
  .object(expenseFields)
  .refine(taxWithinAmount, {
    message: "Tax can't be more than the amount",
    path: ["taxAmount"],
  })
export type CreateExpenseInput = z.input<typeof createExpenseSchema>

export const updateExpenseSchema = z
  .object({
    ...expenseFields,
    taxAmount: z.number().int().min(0),
    paymentMethod: expensePaymentMethodSchema,
    billable: z.boolean(),
    currency: currencyCodeSchema,
  })
  .partial()
  .refine(taxWithinAmount, {
    message: "Tax can't be more than the amount",
    path: ["taxAmount"],
  })
export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>

export const listExpensesQuerySchema = pageQuerySchema.extend({
  sort: sortQuery(["spentOn", "amount", "vendor", "createdAt"]),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  categoryId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  /** "unbilled": billable and not on an invoice yet. */
  billing: z.enum(["billable", "unbilled", "non_billable"]).optional(),
  q: z.string().trim().max(100).optional(),
})
export type ListExpensesQuery = z.input<typeof listExpensesQuerySchema>

export const expenseListSchema = paged(expenseSchema).extend({
  /** Sum of `amount` for everything matching the filters, per currency. */
  totals: z.array(z.object({ currency: z.string(), amount: z.number().int() })),
})
export type ExpenseList = z.infer<typeof expenseListSchema>

export const invoiceFromExpensesSchema = z.object({
  clientId: z.uuid(),
  /** Defaults to all of the client's unbilled billable expenses. */
  expenseIds: z.array(z.uuid()).max(500).optional(),
})
export type InvoiceFromExpensesInput = z.input<typeof invoiceFromExpensesSchema>

// ── Profit & loss ─────────────────────────────────────────

export const profitLossQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
})
export type ProfitLossQuery = z.input<typeof profitLossQuerySchema>

const money = z.object({ currency: z.string(), amount: z.number().int() })

export const profitLossSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  /** One row per month and currency, oldest first. */
  months: z.array(
    z.object({
      month: z.string(), // YYYY-MM
      currency: z.string(),
      /** Payments received, minus refunds made, in the month. */
      income: z.number().int(),
      expenses: z.number().int(),
      profit: z.number().int(),
    })
  ),
  totals: z.array(
    money.extend({ income: z.number().int(), expenses: z.number().int() })
  ),
  byCategory: z.array(
    z.object({
      categoryId: z.string().nullable(),
      name: z.string(),
      currency: z.string(),
      amount: z.number().int(),
    })
  ),
  /** Tax on invoices issued in the period vs tax paid on expenses. */
  tax: z.array(
    z.object({
      currency: z.string(),
      collected: z.number().int(),
      paid: z.number().int(),
    })
  ),
})
export type ProfitLoss = z.infer<typeof profitLossSchema>
