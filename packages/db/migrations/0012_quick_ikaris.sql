CREATE TABLE "contract_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"template_id" uuid,
	"quote_id" uuid,
	"project_id" uuid,
	"number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"rendered_body" text,
	"effective_date" date,
	"end_date" date,
	"client_snapshot" jsonb,
	"issuer_snapshot" jsonb,
	"sent_at" timestamp with time zone,
	"signed_at" date,
	"signed_by_name" text,
	"declined_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_workspaceId_number_unique" UNIQUE("workspace_id","number")
);
--> statement-breakpoint
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_templates_workspace_id_name_index" ON "contract_templates" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "contracts_workspace_id_id_index" ON "contracts" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "contracts_workspace_id_status_index" ON "contracts" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "contracts_client_id_index" ON "contracts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "contracts_quote_id_index" ON "contracts" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "contracts_project_id_index" ON "contracts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "contracts_workspace_number_lower_idx" ON "contracts" USING btree ("workspace_id",lower("number"));--> statement-breakpoint
-- Data: new permission `contract.send` for existing system Admin roles.
-- (The catalog sync on boot keeps the description current; Owner roles get
-- every key automatically.)
INSERT INTO "permissions" ("key", "resource", "action", "description")
VALUES ('contract.send', 'contract', 'send', 'Send contracts and record signatures')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT "id", 'contract.send' FROM "roles" WHERE "is_system" AND "slug" = 'admin'
ON CONFLICT DO NOTHING;
