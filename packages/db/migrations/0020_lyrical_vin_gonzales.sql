CREATE TABLE "platform_payment_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"account_name" text,
	"account_number" text,
	"instructions" text,
	"qr_key" text,
	"currencies" text[] DEFAULT '{}' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_key" text NOT NULL,
	"interval" text NOT NULL,
	"currency" text NOT NULL,
	"amount" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_prices_planKey_interval_currency_unique" UNIQUE("plan_key","interval","currency")
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_key" text NOT NULL,
	"interval" text NOT NULL,
	"currency" text NOT NULL,
	"amount" integer NOT NULL,
	"periods" integer DEFAULT 1 NOT NULL,
	"paid_on" date NOT NULL,
	"platform_payment_account_id" uuid,
	"reference" text,
	"note" text,
	"file_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"submitted_by_user_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_subscriptions" ADD COLUMN "last_reminder" text;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_platform_payment_account_id_platform_payment_accounts_id_fk" FOREIGN KEY ("platform_payment_account_id") REFERENCES "public"."platform_payment_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_submitted_by_user_id_user_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_payments_status_created_at_index" ON "subscription_payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "subscription_payments_workspace_id_created_at_index" ON "subscription_payments" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_payments_one_pending" ON "subscription_payments" USING btree ("workspace_id") WHERE status = 'pending';