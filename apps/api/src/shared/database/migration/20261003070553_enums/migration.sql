-- Fixed value lists stay plain `text` (schema/value-lists.ts): views in other schemas
-- read these columns, and changing their type breaks them. This migration only makes
-- the optional columns nullable and turns "" into NULL there.
ALTER TABLE "master_data"."asset_tags" ALTER COLUMN "tag_role" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data"."asset_tags" ALTER COLUMN "count_basis" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "master_data"."asset_tags" ALTER COLUMN "count_basis" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data"."asset_tags" ALTER COLUMN "count_side" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "master_data"."asset_tags" ALTER COLUMN "count_side" DROP NOT NULL;--> statement-breakpoint
UPDATE "master_data"."asset_tags" SET "tag_role" = NULL WHERE "tag_role" = '';--> statement-breakpoint
UPDATE "master_data"."asset_tags" SET "count_basis" = NULL WHERE "count_basis" = '';--> statement-breakpoint
UPDATE "master_data"."asset_tags" SET "count_side" = NULL WHERE "count_side" = '';--> statement-breakpoint
UPDATE "master_data"."product" SET "packaging_level" = NULL WHERE "packaging_level" = '';--> statement-breakpoint
UPDATE "master_data"."bom_line" SET "dispense_tolerance_type" = NULL WHERE "dispense_tolerance_type" = '';--> statement-breakpoint
UPDATE "master_data"."fiscal_year" SET "period_pattern" = NULL WHERE "period_pattern" = '';
