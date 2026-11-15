import { z } from "zod"

import {
  addressSchema,
  optionalEmail,
  optionalText,
  optionalUrl,
} from "../common/locale.js"
import { currencyCodeSchema } from "../common/money.js"
import { paged, pageQuerySchema, sortQuery } from "../common/pagination.js"

export const clientTypeSchema = z.enum(["company", "individual"])
export const clientStatusSchema = z.enum(["active", "archived"])

export const clientContactSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  title: z.string().nullable(),
  isPrimary: z.boolean(),
  createdAt: z.iso.datetime(),
})
export type ClientContact = z.infer<typeof clientContactSchema>

export const clientSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  type: clientTypeSchema,
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  taxId: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  /** null → use the workspace default currency. */
  currency: z.string().nullable(),
  /** null → use the workspace default payment terms. */
  paymentTermsDays: z.number().int().nullable(),
  notes: z.string().nullable(),
  status: clientStatusSchema,
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Client = z.infer<typeof clientSchema>

export const clientDetailSchema = clientSchema.extend({
  contacts: z.array(clientContactSchema),
})
export type ClientDetail = z.infer<typeof clientDetailSchema>

const clientFields = {
  type: clientTypeSchema,
  name: z.string().trim().min(1, "Required").max(200),
  email: optionalEmail,
  phone: optionalText(50),
  website: optionalUrl,
  taxId: optionalText(50),
  currency: currencyCodeSchema
    .nullish()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  paymentTermsDays: z
    .number()
    .int()
    .min(0)
    .max(365)
    .nullish()
    .transform((v) => v ?? null),
  notes: optionalText(5000),
  ...addressSchema.shape,
}

export const createClientSchema = z.object({
  ...clientFields,
  type: clientTypeSchema.default("company"),
})
export type CreateClientInput = z.input<typeof createClientSchema>

// Explicit partial: no defaults, so omitted fields stay untouched on PATCH.
export const updateClientSchema = z.object(clientFields).partial()
export type UpdateClientInput = z.input<typeof updateClientSchema>

export const listClientsQuerySchema = pageQuerySchema.extend({
  sort: sortQuery(["name", "email", "createdAt"]),
  q: z.string().trim().max(100).optional(),
  status: clientStatusSchema.default("active"),
})
export type ListClientsQuery = z.input<typeof listClientsQuerySchema>

export const clientListSchema = paged(clientSchema)
export type ClientList = z.infer<typeof clientListSchema>

export const createClientContactSchema = z.object({
  name: z.string().trim().min(1, "Required").max(200),
  email: optionalEmail,
  phone: optionalText(50),
  title: optionalText(100),
  isPrimary: z.boolean().default(false),
})
export type CreateClientContactInput = z.input<typeof createClientContactSchema>

export const updateClientContactSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: optionalEmail,
    phone: optionalText(50),
    title: optionalText(100),
    isPrimary: z.boolean(),
  })
  .partial()
export type UpdateClientContactInput = z.input<typeof updateClientContactSchema>
