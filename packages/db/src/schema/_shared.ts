import { timestamp, uuid } from "drizzle-orm/pg-core"
import { uuidv7 } from "uuidv7"

/** Primary key: UUIDv7 (time-ordered → index-friendly), generated app-side. */
export const id = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7())

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

/** Soft delete column for business records (not for auth/iam tables). */
export const softDelete = {
  deletedAt: timestamp({ withTimezone: true }),
}
