CREATE TABLE "credit_note_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"credit_note_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" integer NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"amount" integer NOT NULL,
	"tax_amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"issue_date" date NOT NULL,
	"reason" text NOT NULL,
	"currency" text NOT NULL,
	"subtotal" integer NOT NULL,
	"tax_total" integer NOT NULL,
	"total" integer NOT NULL,
	"applied_amount" integer NOT NULL,
	"refund_amount" integer NOT NULL,
	"client_snapshot" jsonb,
	"issuer_snapshot" jsonb,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"last_sent_at" timestamp with time zone,
	"last_sent_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_workspaceId_number_unique" UNIQUE("workspace_id","number")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "amount_credited" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_note_lines_credit_note_id_position_index" ON "credit_note_lines" USING btree ("credit_note_id","position");--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_id_index" ON "credit_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "credit_notes_workspace_id_issue_date_index" ON "credit_notes" USING btree ("workspace_id","issue_date");