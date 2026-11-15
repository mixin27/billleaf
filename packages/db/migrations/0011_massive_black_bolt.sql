CREATE TABLE "recurring_invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text,
	"currency" text NOT NULL,
	"lines" jsonb NOT NULL,
	"every" integer DEFAULT 1 NOT NULL,
	"unit" text DEFAULT 'month' NOT NULL,
	"start_date" date NOT NULL,
	"anchor_day" integer NOT NULL,
	"end_date" date,
	"max_occurrences" integer,
	"next_run_date" date,
	"due_days" integer,
	"mode" text DEFAULT 'draft' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"terms" text,
	"generated_count" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "recurring_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "recurring_period" date;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_invoices_workspace_id_id_index" ON "recurring_invoices" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "recurring_due_idx" ON "recurring_invoices" USING btree ("status","next_run_date");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recurring_id_recurring_invoices_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recurringId_recurringPeriod_unique" UNIQUE("recurring_id","recurring_period");