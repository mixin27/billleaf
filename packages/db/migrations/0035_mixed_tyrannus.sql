ALTER TABLE "quotes" ADD COLUMN "discount_type" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "discount_value" integer;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "discount_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD COLUMN "discount_type" text;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD COLUMN "discount_value" integer;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "discount_type" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "discount_value" integer;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "discount_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount_type" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount_value" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount_total" integer DEFAULT 0 NOT NULL;