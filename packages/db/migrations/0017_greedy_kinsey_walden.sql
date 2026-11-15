CREATE TABLE "portal_responses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"document_id" uuid NOT NULL,
	"document_number" text,
	"action" text NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"reason" text,
	"document_hash" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "responded_by_name" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "responded_via" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "decline_reason" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "signed_via" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "decline_reason" text;--> statement-breakpoint
ALTER TABLE "portal_responses" ADD CONSTRAINT "portal_responses_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_responses" ADD CONSTRAINT "portal_responses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_responses_document_type_document_id_index" ON "portal_responses" USING btree ("document_type","document_id");