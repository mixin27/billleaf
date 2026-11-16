CREATE TABLE "member_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"hourly_rate" integer,
	"cost_rate" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_budget_alerts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"threshold" integer NOT NULL,
	"estimate" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_profiles" ADD COLUMN "default_hourly_rate" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "estimate_minutes" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "estimate_amount" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "hourly_rate" integer;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "billed_rate" integer;--> statement-breakpoint
ALTER TABLE "member_rates" ADD CONSTRAINT "member_rates_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_rates" ADD CONSTRAINT "member_rates_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_alerts" ADD CONSTRAINT "project_budget_alerts_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_alerts" ADD CONSTRAINT "project_budget_alerts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_rates_member_unique" ON "member_rates" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_budget_alerts_unique" ON "project_budget_alerts" USING btree ("project_id","kind","threshold","estimate");--> statement-breakpoint
INSERT INTO "permissions" ("key", "resource", "action", "description")
VALUES
  ('rate.read', 'rate', 'read', 'See member rates, costs and profit'),
  ('rate.manage', 'rate', 'manage', 'Set the default and member hourly rates')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT "id", 'rate.read' FROM "roles" WHERE "is_system" AND "slug" IN ('admin', 'accountant')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT "id", 'rate.manage' FROM "roles" WHERE "is_system" AND "slug" = 'admin'
ON CONFLICT DO NOTHING;
