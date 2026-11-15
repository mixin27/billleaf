import { z } from "zod"

const roleRef = z.object({ id: z.string(), slug: z.string(), name: z.string() })

export const memberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  joinedAt: z.iso.datetime(),
  roles: z.array(roleRef),
  isCurrentUser: z.boolean(),
})
export type Member = z.infer<typeof memberSchema>

export const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: roleRef.nullable(),
  status: z.enum(["pending", "accepted", "rejected", "canceled"]),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  isExpired: z.boolean(),
  invitedBy: z.string().nullable(),
})
export type Invitation = z.infer<typeof invitationSchema>

export const createInvitationSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((e) => e.trim().toLowerCase()),
  roleId: z.uuid(),
})
export type CreateInvitationInput = z.input<typeof createInvitationSchema>
