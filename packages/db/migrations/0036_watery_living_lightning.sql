CREATE TABLE "cashbook_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashbook_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"entry_date" date NOT NULL,
	"entry_time" time(0) NOT NULL,
	"remark" text,
	"contact_name" text,
	"category_id" uuid,
	"mode_id" uuid,
	"created_by_member_id" uuid,
	"updated_by_member_id" uuid,
	"import_key" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashbook_entry_files" (
	"workspace_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cashbook_entry_files_entry_id_file_id_pk" PRIMARY KEY("entry_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "cashbook_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashbook_modes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashbooks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"fields" jsonb DEFAULT '{"contact":true,"category":true,"mode":true}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cashbook_categories" ADD CONSTRAINT "cashbook_categories_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_categories" ADD CONSTRAINT "cashbook_categories_book_id_cashbooks_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."cashbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_book_id_cashbooks_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."cashbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_category_id_cashbook_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."cashbook_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_mode_id_cashbook_modes_id_fk" FOREIGN KEY ("mode_id") REFERENCES "public"."cashbook_modes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_created_by_member_id_member_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_updated_by_member_id_member_id_fk" FOREIGN KEY ("updated_by_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_files" ADD CONSTRAINT "cashbook_entry_files_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_files" ADD CONSTRAINT "cashbook_entry_files_entry_id_cashbook_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."cashbook_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_files" ADD CONSTRAINT "cashbook_entry_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_members" ADD CONSTRAINT "cashbook_members_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_members" ADD CONSTRAINT "cashbook_members_book_id_cashbooks_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."cashbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_members" ADD CONSTRAINT "cashbook_members_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_modes" ADD CONSTRAINT "cashbook_modes_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_modes" ADD CONSTRAINT "cashbook_modes_book_id_cashbooks_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."cashbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbooks" ADD CONSTRAINT "cashbooks_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbooks" ADD CONSTRAINT "cashbooks_created_by_member_id_member_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cashbook_categories_book_name_unique" ON "cashbook_categories" USING btree ("book_id",lower("name"));--> statement-breakpoint
CREATE INDEX "cashbook_entries_book_id_entry_date_entry_time_index" ON "cashbook_entries" USING btree ("book_id","entry_date","entry_time");--> statement-breakpoint
CREATE UNIQUE INDEX "cashbook_entries_book_import_unique" ON "cashbook_entries" USING btree ("book_id","import_key") WHERE import_key is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "cashbook_members_book_member_unique" ON "cashbook_members" USING btree ("book_id","member_id");--> statement-breakpoint
CREATE INDEX "cashbook_members_member_id_index" ON "cashbook_members" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cashbook_modes_book_name_unique" ON "cashbook_modes" USING btree ("book_id",lower("name"));--> statement-breakpoint
CREATE INDEX "cashbooks_workspace_id_index" ON "cashbooks" USING btree ("workspace_id");--> statement-breakpoint
-- Data: new cashbook permissions for existing system roles (ADR-0019).
-- The catalog sync on boot keeps descriptions current; Owner roles get
-- every key automatically.
INSERT INTO "permissions" ("key", "resource", "action", "description")
VALUES
  ('cashbook.create', 'cashbook', 'create', 'Create cashbooks (and use the ones you''re added to)'),
  ('cashbook.manage', 'cashbook', 'manage', 'See and manage every cashbook in the workspace')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT "id", 'cashbook.create' FROM "roles"
WHERE "is_system" AND "slug" IN ('admin', 'member', 'accountant')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT "id", 'cashbook.manage' FROM "roles" WHERE "is_system" AND "slug" = 'admin'
ON CONFLICT DO NOTHING;
