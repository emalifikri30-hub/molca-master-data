CREATE TABLE "master_data"."product_uom_measurement" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" text NOT NULL,
	"uom_id" text NOT NULL,
	"min_weight" double precision NOT NULL,
	"max_weight" double precision NOT NULL,
	"standard_weight" double precision NOT NULL,
	"length" double precision,
	"width" double precision,
	"height" double precision,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
ALTER TABLE "master_data"."product_detail" ADD COLUMN "dimension_uom_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."product_detail" DROP COLUMN "min_weight";--> statement-breakpoint
ALTER TABLE "master_data"."product_detail" DROP COLUMN "max_weight";--> statement-breakpoint
ALTER TABLE "master_data"."product_detail" DROP COLUMN "standard_weight";--> statement-breakpoint
ALTER TABLE "master_data"."product_detail" DROP COLUMN "length";--> statement-breakpoint
ALTER TABLE "master_data"."product_detail" DROP COLUMN "width";--> statement-breakpoint
ALTER TABLE "master_data"."product_detail" DROP COLUMN "height";--> statement-breakpoint
CREATE INDEX "product_uom_measurement_region_idx" ON "master_data"."product_uom_measurement" ("region");--> statement-breakpoint
-- PRD-003 PRO-002 (per-unit measurement, PO 2026-10-05, F-06 §9.2.1 Keys):
-- "No overlap: one active row per (product_id, uom_id)" — an exclusion
-- constraint on the half-open validity range, like product_detail's
-- (F-00 keys rule 4, E-1 resolved 2026-10-02). The service check stays: it
-- gives the screen its named refusal first.
ALTER TABLE "master_data"."product_uom_measurement" ADD CONSTRAINT "product_uom_measurement_no_overlap"
  EXCLUDE USING gist ("product_id" WITH =, "uom_id" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&);
