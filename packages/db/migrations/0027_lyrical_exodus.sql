ALTER TABLE "time_entries" ADD COLUMN "has_times" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Backfill: entries logged as a date + duration were anchored at 12:00 UTC of their date.
UPDATE "time_entries" SET "has_times" = false
WHERE "import_batch_id" IS NULL
  AND "started_at" = ("entry_date"::timestamp + interval '12 hours') AT TIME ZONE 'UTC';
