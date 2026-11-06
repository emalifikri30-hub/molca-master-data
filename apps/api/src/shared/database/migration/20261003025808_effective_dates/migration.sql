ALTER TABLE "master_data"."product" ADD COLUMN "valid_from" date;--> statement-breakpoint
ALTER TABLE "master_data"."measurement_group" ADD COLUMN "valid_from" date;--> statement-breakpoint
ALTER TABLE "master_data"."measurement_group" ADD COLUMN "valid_to" date;--> statement-breakpoint
ALTER TABLE "master_data"."asset_class" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."asset_class" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."asset_type" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."asset_type" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."asset" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."asset" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."asset_product_code" ALTER COLUMN "valid_from" SET DATA TYPE timestamp with time zone USING NULLIF("valid_from", '')::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "master_data"."asset_product_code" ALTER COLUMN "valid_to" SET DATA TYPE timestamp with time zone USING NULLIF("valid_to", '')::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "master_data"."data_source" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."data_source" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."enterprise" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."enterprise" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."site_class" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."site_class" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."area_class" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."area_class" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."work_center_class" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."work_center_class" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."work_unit_class" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."work_unit_class" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."site" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."site" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."area" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."area" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."work_center" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."work_center" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."work_unit" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."work_unit" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."equipment_flow" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."equipment_flow" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."kpi_parameter" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."kpi_parameter" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."product" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."product_uom_conversion" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."product_uom_conversion" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."enterprise_shift" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."enterprise_shift" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."fiscal_year" ALTER COLUMN "valid_from" SET DATA TYPE date USING NULLIF("valid_from", '')::date;--> statement-breakpoint
ALTER TABLE "master_data"."fiscal_year" ALTER COLUMN "valid_to" SET DATA TYPE date USING NULLIF("valid_to", '')::date;--> statement-breakpoint
-- valid_from is required (F-01, F-05, F-06) but was never written: rows from
-- before this migration start on the day they were created.
UPDATE "master_data"."product" SET "valid_from" = "created_at"::date WHERE "valid_from" IS NULL;--> statement-breakpoint
UPDATE "master_data"."measurement_group" SET "valid_from" = "created_at"::date WHERE "valid_from" IS NULL;--> statement-breakpoint
UPDATE "master_data"."site" SET "valid_from" = "created_at"::date WHERE "valid_from" IS NULL;--> statement-breakpoint
UPDATE "master_data"."area" SET "valid_from" = "created_at"::date WHERE "valid_from" IS NULL;--> statement-breakpoint
UPDATE "master_data"."work_center" SET "valid_from" = "created_at"::date WHERE "valid_from" IS NULL;--> statement-breakpoint
UPDATE "master_data"."work_unit" SET "valid_from" = "created_at"::date WHERE "valid_from" IS NULL;
