CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"workspace_id" uuid,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_provider_eventId_unique" UNIQUE("provider","event_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD COLUMN "interval" text;--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD COLUMN "last_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_events_workspace_id_occurred_at_index" ON "billing_events" USING btree ("workspace_id","occurred_at");