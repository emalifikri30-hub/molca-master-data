CREATE TABLE "master_data"."asset_label" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"tenant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asset_id" text NOT NULL,
	"status" text DEFAULT 'printed' NOT NULL,
	"print_count" integer DEFAULT 0 NOT NULL,
	"last_printed_at" timestamp with time zone,
	"last_printed_by" text DEFAULT '' NOT NULL,
	"installed_at" timestamp with time zone,
	"installed_by" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE INDEX "asset_label_region_idx" ON "master_data"."asset_label" ("region");--> statement-breakpoint
CREATE INDEX "asset_label_tenant_idx" ON "master_data"."asset_label" ("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."asset_label" ADD CONSTRAINT "asset_label_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");