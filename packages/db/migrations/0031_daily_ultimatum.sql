ALTER TABLE "time_import_batches" ADD COLUMN "undone_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "time_import_batches" ADD COLUMN "removed_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "time_entries_import_batch_id_index" ON "time_entries" USING btree ("import_batch_id");