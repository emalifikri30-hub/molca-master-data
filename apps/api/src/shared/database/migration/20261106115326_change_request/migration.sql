CREATE TABLE "master_data"."change_request" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"tenant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_label" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"body" jsonb,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"maker_id" text NOT NULL,
	"maker_name" text DEFAULT '' NOT NULL,
	"decided_by" text,
	"decided_by_name" text DEFAULT '' NOT NULL,
	"decision_note" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "change_request_region_idx" ON "master_data"."change_request" ("region");--> statement-breakpoint
CREATE INDEX "change_request_tenant_idx" ON "master_data"."change_request" ("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."change_request" ADD CONSTRAINT "change_request_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");