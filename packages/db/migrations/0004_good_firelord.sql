CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" integer NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"amount" integer NOT NULL,
	"tax_amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"quote_id" uuid,
	"number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text,
	"currency" text NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date,
	"notes" text,
	"terms" text,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"tax_total" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"amount_paid" integer DEFAULT 0 NOT NULL,
	"client_snapshot" jsonb,
	"issuer_snapshot" jsonb,
	"issued_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"last_sent_at" timestamp with time zone,
	"last_sent_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_workspaceId_number_unique" UNIQUE("workspace_id","number"),
	CONSTRAINT "invoices_quoteId_unique" UNIQUE("quote_id")
);
--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_id_position_index" ON "invoice_lines" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX "invoices_workspace_id_id_index" ON "invoices" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "invoices_workspace_id_status_due_date_index" ON "invoices" USING btree ("workspace_id","status","due_date");--> statement-breakpoint
CREATE INDEX "invoices_client_id_index" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "invoices_workspace_number_lower_idx" ON "invoices" USING btree ("workspace_id",lower("number"));