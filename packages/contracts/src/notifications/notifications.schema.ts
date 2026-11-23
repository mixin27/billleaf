import { z } from "zod"

import type { Permission } from "../iam/permissions.js"

/**
 * What can send a push to your phone, and who it goes to: members of the
 * workspace who hold `permission` (and haven't turned the type off), never
 * the member who did it.
 */
export const PUSH_TYPES = [
  {
    type: "quote.answered",
    label: "Quote accepted or declined",
    permission: "quote.read",
  },
  {
    type: "contract.signed",
    label: "Contract signed",
    permission: "contract.read",
  },
  {
    type: "payment.received",
    label: "Payment received or proof of payment sent",
    permission: "invoice.read",
  },
  {
    type: "timesheet.submitted",
    label: "Timesheet submitted for approval",
    permission: "time.approve",
  },
] as const satisfies readonly {
  type: string
  label: string
  permission: Permission
}[]

export const pushTypeSchema = z.enum([
  "quote.answered",
  "contract.signed",
  "payment.received",
  "timesheet.submitted",
])
export type PushType = z.infer<typeof pushTypeSchema>

export const pushPlatformSchema = z.enum(["ios", "android"])

/** This phone's push token (from Expo), sent after sign-in. */
export const registerPushDeviceSchema = z.object({
  token: z.string().trim().min(1).max(255),
  platform: pushPlatformSchema,
  deviceName: z.string().trim().max(100).optional(),
  appVersion: z.string().trim().max(40).optional(),
})
export type RegisterPushDeviceInput = z.infer<typeof registerPushDeviceSchema>

export const notificationSettingSchema = z.object({
  type: pushTypeSchema,
  label: z.string(),
  enabled: z.boolean(),
})

/** Your push choices; they follow you on every phone and workspace. */
export const notificationSettingsSchema = z.object({
  items: z.array(notificationSettingSchema),
})
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>

export const updateNotificationSettingSchema = z.object({
  type: pushTypeSchema,
  enabled: z.boolean(),
})
export type UpdateNotificationSettingInput = z.infer<
  typeof updateNotificationSettingSchema
>
