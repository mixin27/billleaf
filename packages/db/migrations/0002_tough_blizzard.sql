CREATE TABLE "quote_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" integer NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"amount" integer NOT NULL,
	"tax_amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text,
	"currency" text NOT NULL,
	"issue_date" date NOT NULL,
	"valid_until" date,
	"notes" text,
	"terms" text,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"tax_total" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"client_snapshot" jsonb,
	"issuer_snapshot" jsonb,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_workspaceId_number_unique" UNIQUE("workspace_id","number")
);
--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_lines_quote_id_position_index" ON "quote_lines" USING btree ("quote_id","position");--> statement-breakpoint
CREATE INDEX "quotes_workspace_id_id_index" ON "quotes" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "quotes_workspace_id_status_index" ON "quotes" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "quotes_client_id_index" ON "quotes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "quotes_workspace_number_lower_idx" ON "quotes" USING btree ("workspace_id",lower("number"));