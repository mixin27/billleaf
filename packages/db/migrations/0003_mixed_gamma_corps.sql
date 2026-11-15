CREATE TABLE "invitation_roles" (
	"invitation_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitation_roles" ADD CONSTRAINT "invitation_roles_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_roles" ADD CONSTRAINT "invitation_roles_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_roles" ADD CONSTRAINT "invitation_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_roles_workspace_id_index" ON "invitation_roles" USING btree ("workspace_id");