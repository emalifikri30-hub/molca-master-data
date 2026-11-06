CREATE TABLE "master_data"."crew" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"tenant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"site_id" text DEFAULT '' NOT NULL,
	"shift" text DEFAULT '' NOT NULL,
	"leader_id" text DEFAULT '' NOT NULL,
	"member_ids" jsonb DEFAULT '[]' NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE INDEX "crew_region_idx" ON "master_data"."crew" ("region");--> statement-breakpoint
CREATE INDEX "crew_tenant_idx" ON "master_data"."crew" ("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."crew" ADD CONSTRAINT "crew_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");