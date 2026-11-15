CREATE TABLE "payment_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"account_name" text,
	"account_number" text,
	"instructions" text,
	"qr_file_id" uuid,
	"currencies" text[] DEFAULT '{}' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_proofs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"paid_on" date NOT NULL,
	"payment_account_id" uuid,
	"reference" text,
	"note" text,
	"file_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"payment_id" uuid,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"submitted_email" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_qr_file_id_files_id_fk" FOREIGN KEY ("qr_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_payment_account_id_payment_accounts_id_fk" FOREIGN KEY ("payment_account_id") REFERENCES "public"."payment_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_accounts_workspace_id_position_index" ON "payment_accounts" USING btree ("workspace_id","position");--> statement-breakpoint
CREATE INDEX "payment_proofs_workspace_id_status_index" ON "payment_proofs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "payment_proofs_invoice_id_index" ON "payment_proofs" USING btree ("invoice_id");