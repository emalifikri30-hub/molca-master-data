CREATE TABLE "master_data"."work_unit_kpi_binding_change" (
	"change_id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"binding_id" text NOT NULL,
	"work_unit_id" text NOT NULL,
	"slot_id" text NOT NULL,
	"action" text NOT NULL,
	"old_valid_from" date,
	"old_valid_to" date,
	"new_valid_from" date,
	"new_valid_to" date,
	"changed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "work_unit_kpi_binding_change_region_idx" ON "master_data"."work_unit_kpi_binding_change" ("region");--> statement-breakpoint
CREATE VIEW "master_data"."kpi_input_change" AS (select change_id, region, 'asset_product_code' as source_table, asset_product_code_id as row_id, work_unit_id, action, old_valid_from, old_valid_to, new_valid_from, new_valid_to, changed_at as saved_at from master_data.asset_product_code_change
union all
select change_id, region, 'work_unit_kpi_binding' as source_table, binding_id as row_id, work_unit_id, action, old_valid_from::timestamptz, old_valid_to::timestamptz, new_valid_from::timestamptz, new_valid_to::timestamptz, changed_at as saved_at from master_data.work_unit_kpi_binding_change);