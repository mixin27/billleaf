CREATE TABLE "invoice_reminders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"offset_days" integer NOT NULL,
	"sent_to" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_reminders_invoiceId_offsetDays_unique" UNIQUE("invoice_id","offset_days")
);
--> statement-breakpoint
ALTER TABLE "workspace_profiles" ADD COLUMN "invoice_reminder_offsets" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "reminders_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_reminders_workspace_id_index" ON "invoice_reminders" USING btree ("workspace_id");