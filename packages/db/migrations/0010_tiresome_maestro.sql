ALTER TABLE "time_entries" DROP CONSTRAINT "time_entries_member_id_member_id_fk";
--> statement-breakpoint
ALTER TABLE "time_entries" ALTER COLUMN "member_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "member_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill the name snapshot for existing entries.
UPDATE "time_entries" AS te SET "member_name" = u."name"
FROM "member" AS m JOIN "user" AS u ON u."id" = m."user_id"
WHERE m."id" = te."member_id" AND te."member_name" = '';
