CREATE TABLE "master_data"."bin" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"tenant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_id" text NOT NULL,
	"code" text NOT NULL,
	"tag" text DEFAULT '' NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "master_data"."failure_code" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"tenant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"iso14224_class" text NOT NULL,
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"label_id" text NOT NULL,
	"label_en" text NOT NULL,
	"custom" boolean DEFAULT false NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "master_data"."item_cost" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"tenant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"item_id" text NOT NULL,
	"source" text NOT NULL,
	"old_cost" numeric(18,2),
	"new_cost" numeric(18,2) NOT NULL,
	"price" numeric(18,2),
	"quantity" numeric(14,3),
	"on_hand" numeric(14,3),
	"reference" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"by_name" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_data"."item" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"tenant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"uom" text DEFAULT 'pcs' NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"rotable" boolean DEFAULT false NOT NULL,
	"min_qty" numeric(14,3) DEFAULT '0' NOT NULL,
	"max_qty" numeric(14,3),
	"lead_time_days" integer,
	"unit_cost" numeric(18,2),
	"batch_tracked" boolean DEFAULT false NOT NULL,
	"erp_code" text DEFAULT '' NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "master_data"."store" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"tenant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"site_id" text DEFAULT '' NOT NULL,
	"work_unit_id" text DEFAULT '' NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE INDEX "bin_region_idx" ON "master_data"."bin" ("region");--> statement-breakpoint
CREATE INDEX "bin_tenant_idx" ON "master_data"."bin" ("tenant_id");--> statement-breakpoint
CREATE INDEX "failure_code_region_idx" ON "master_data"."failure_code" ("region");--> statement-breakpoint
CREATE INDEX "failure_code_tenant_idx" ON "master_data"."failure_code" ("tenant_id");--> statement-breakpoint
CREATE INDEX "item_cost_region_idx" ON "master_data"."item_cost" ("region");--> statement-breakpoint
CREATE INDEX "item_cost_tenant_idx" ON "master_data"."item_cost" ("tenant_id");--> statement-breakpoint
CREATE INDEX "item_region_idx" ON "master_data"."item" ("region");--> statement-breakpoint
CREATE INDEX "item_tenant_idx" ON "master_data"."item" ("tenant_id");--> statement-breakpoint
CREATE INDEX "store_region_idx" ON "master_data"."store" ("region");--> statement-breakpoint
CREATE INDEX "store_tenant_idx" ON "master_data"."store" ("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."bin" ADD CONSTRAINT "bin_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."failure_code" ADD CONSTRAINT "failure_code_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."item_cost" ADD CONSTRAINT "item_cost_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."item" ADD CONSTRAINT "item_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."store" ADD CONSTRAINT "store_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");