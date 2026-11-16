CREATE TABLE "timesheet_approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"status" text NOT NULL,
	"total_seconds" integer DEFAULT 0 NOT NULL,
	"billable_seconds" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_member_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_profiles" ADD COLUMN "timesheet_approvals" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "timesheet_approvals" ADD CONSTRAINT "timesheet_approvals_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_approvals" ADD CONSTRAINT "timesheet_approvals_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_approvals" ADD CONSTRAINT "timesheet_approvals_reviewed_by_member_id_member_id_fk" FOREIGN KEY ("reviewed_by_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "timesheet_approvals_member_week_unique" ON "timesheet_approvals" USING btree ("workspace_id","member_id","week_start");--> statement-breakpoint
CREATE INDEX "timesheet_approvals_workspace_id_status_index" ON "timesheet_approvals" USING btree ("workspace_id","status");--> statement-breakpoint
-- Data: new permission `time.approve` for existing system Admin roles
-- (the catalog sync on boot keeps the description current; Owner roles get
-- every key automatically).
INSERT INTO "permissions" ("key", "resource", "action", "description")
VALUES ('time.approve', 'time', 'approve', 'Approve or reject submitted timesheets')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT "id", 'time.approve' FROM "roles" WHERE "is_system" AND "slug" = 'admin'
ON CONFLICT DO NOTHING;
