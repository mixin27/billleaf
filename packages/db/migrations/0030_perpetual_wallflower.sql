ALTER TABLE "workspace_profiles" ADD COLUMN "time_rounding_mode" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_profiles" ADD COLUMN "time_rounding_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_profiles" ADD COLUMN "time_locked_before" date;