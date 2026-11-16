CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"spent_on" date NOT NULL,
	"vendor" text,
	"description" text,
	"category_id" uuid,
	"amount" integer NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"payment_method" text DEFAULT 'bank_transfer' NOT NULL,
	"reference" text,
	"client_id" uuid,
	"project_id" uuid,
	"billable" boolean DEFAULT false NOT NULL,
	"invoice_id" uuid,
	"receipt_file_id" uuid,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_receipt_file_id_files_id_fk" FOREIGN KEY ("receipt_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_member_id_member_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_workspace_name_unique" ON "expense_categories" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "expenses_workspace_id_spent_on_index" ON "expenses" USING btree ("workspace_id","spent_on");--> statement-breakpoint
CREATE INDEX "expenses_client_id_index" ON "expenses" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "expenses_project_id_index" ON "expenses" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "expenses_invoice_id_index" ON "expenses" USING btree ("invoice_id");--> statement-breakpoint
INSERT INTO "permissions" ("key", "resource", "action", "description")
VALUES
  ('expense.read', 'expense', 'read', 'View expenses and receipts'),
  ('expense.create', 'expense', 'create', 'Record expenses'),
  ('expense.update', 'expense', 'update', 'Edit expenses and categories'),
  ('expense.delete', 'expense', 'delete', 'Delete expenses')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r."id", p.k FROM "roles" r
CROSS JOIN (VALUES ('expense.read'), ('expense.create'), ('expense.update'), ('expense.delete')) AS p(k)
WHERE r."is_system" AND r."slug" IN ('admin', 'accountant')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r."id", p.k FROM "roles" r
CROSS JOIN (VALUES ('expense.read'), ('expense.create'), ('expense.update')) AS p(k)
WHERE r."is_system" AND r."slug" = 'member'
ON CONFLICT DO NOTHING;
