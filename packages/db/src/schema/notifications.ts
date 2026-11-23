import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { id } from "./_shared.js"
import { user } from "./auth.js"

/**
 * Phones that get push notifications: one row per Expo push token, bound
 * to whoever signed in on it last. Tokens Expo reports as gone are deleted.
 */
export const pushDevices = pgTable(
  "push_devices",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    platform: text({ enum: ["ios", "android"] }).notNull(),
    deviceName: text(),
    appVersion: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)]
)

/**
 * Push types a user turned off or on; no row means on. Per user, so the
 * choice follows them across phones and workspaces.
 */
export const notificationSettings = pgTable(
  "notification_settings",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text().notNull(),
    enabled: boolean().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })]
)
