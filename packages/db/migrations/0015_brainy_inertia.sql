CREATE TABLE "time_import_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" text NOT NULL,
	"filename" text NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"invalid_count" integer DEFAULT 0 NOT NULL,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "external_hash" text;--> statement-breakpoint
ALTER TABLE "time_import_batches" ADD CONSTRAINT "time_import_batches_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_import_batches" ADD CONSTRAINT "time_import_batches_created_by_member_id_member_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_import_batch_id_time_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."time_import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_external_hash_unique" ON "time_entries" USING btree ("workspace_id","external_hash") WHERE "time_entries"."external_hash" is not null;