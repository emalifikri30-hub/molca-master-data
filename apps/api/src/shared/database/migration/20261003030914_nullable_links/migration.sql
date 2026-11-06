ALTER TABLE "master_data"."asset_class" ALTER COLUMN "parent_class_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "master_data"."asset_class" ALTER COLUMN "parent_class_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data"."asset" ALTER COLUMN "asset_type_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "master_data"."asset" ALTER COLUMN "asset_type_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data"."asset" ALTER COLUMN "parent_asset_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "master_data"."asset" ALTER COLUMN "parent_asset_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data"."asset_tags" ALTER COLUMN "work_unit_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "master_data"."asset_tags" ALTER COLUMN "work_unit_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data"."asset_tags" ALTER COLUMN "reject_reason_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "master_data"."asset_tags" ALTER COLUMN "reject_reason_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data"."asset_tags" ALTER COLUMN "downtime_reason_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "master_data"."asset_tags" ALTER COLUMN "downtime_reason_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data"."asset_tags" ALTER COLUMN "uom_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "master_data"."asset_tags" ALTER COLUMN "uom_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data"."site" ALTER COLUMN "site_class_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "master_data"."site" ALTER COLUMN "site_class_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data"."area" ALTER COLUMN "area_class_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "master_data"."area" ALTER COLUMN "area_class_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data"."work_center" ALTER COLUMN "work_center_class_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "master_data"."work_center" ALTER COLUMN "work_center_class_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data"."work_unit" ALTER COLUMN "work_unit_class_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "master_data"."work_unit" ALTER COLUMN "work_unit_class_id" DROP NOT NULL;;--> statement-breakpoint
-- "" meant "no link": it becomes NULL, so these can carry real foreign keys.
UPDATE "master_data"."asset_class" SET "parent_class_id" = NULL WHERE "parent_class_id" = '';--> statement-breakpoint
UPDATE "master_data"."asset" SET "asset_type_id" = NULL WHERE "asset_type_id" = '';--> statement-breakpoint
UPDATE "master_data"."asset" SET "parent_asset_id" = NULL WHERE "parent_asset_id" = '';--> statement-breakpoint
UPDATE "master_data"."asset_tags" SET "work_unit_id" = NULL WHERE "work_unit_id" = '';--> statement-breakpoint
UPDATE "master_data"."asset_tags" SET "reject_reason_id" = NULL WHERE "reject_reason_id" = '';--> statement-breakpoint
UPDATE "master_data"."asset_tags" SET "downtime_reason_id" = NULL WHERE "downtime_reason_id" = '';--> statement-breakpoint
UPDATE "master_data"."asset_tags" SET "uom_id" = NULL WHERE "uom_id" = '';--> statement-breakpoint
UPDATE "master_data"."site" SET "site_class_id" = NULL WHERE "site_class_id" = '';--> statement-breakpoint
UPDATE "master_data"."area" SET "area_class_id" = NULL WHERE "area_class_id" = '';--> statement-breakpoint
UPDATE "master_data"."work_center" SET "work_center_class_id" = NULL WHERE "work_center_class_id" = '';--> statement-breakpoint
UPDATE "master_data"."work_unit" SET "work_unit_class_id" = NULL WHERE "work_unit_class_id" = '';
