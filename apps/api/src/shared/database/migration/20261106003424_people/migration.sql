CREATE TABLE "master_data"."person" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"tenant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"craft" text DEFAULT '' NOT NULL,
	"skills" jsonb DEFAULT '[]' NOT NULL,
	"site_id" text DEFAULT '' NOT NULL,
	"shift" text DEFAULT '' NOT NULL,
	"hourly_rate" numeric(14,2),
	"phone" text DEFAULT '' NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE INDEX "person_region_idx" ON "master_data"."person" ("region");--> statement-breakpoint
CREATE INDEX "person_tenant_idx" ON "master_data"."person" ("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."person" ADD CONSTRAINT "person_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");