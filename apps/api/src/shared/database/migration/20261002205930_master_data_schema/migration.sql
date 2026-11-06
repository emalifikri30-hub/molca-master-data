-- Every API table moves out of `public` into the `master_data` schema (PO 2026-10-03).
-- SET SCHEMA moves each table with its rows, indexes, primary keys and the
-- `*_no_overlap` exclusion constraints, so no data is copied. The btree_gist
-- extension stays in `public`.
CREATE SCHEMA IF NOT EXISTS "master_data";--> statement-breakpoint
ALTER TABLE "public"."area" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."area_class" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."asset" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."asset_class" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."asset_placement" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."asset_product_code" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."asset_tags" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."asset_type" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."audit_log" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."bom" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."bom_line" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."comments" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."data_source" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."downtime_reason" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."enterprise" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."enterprise_shift" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."equipment_flow" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."fiscal_year" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."kpi_formula_slot" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."kpi_parameter" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."measurement_group" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."operation" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."operation_check" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."operation_dependency" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."operation_instruction" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."operation_work_unit" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."posts" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."product" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."product_detail" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."product_flow" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."product_uom_conversion" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."reason_asset" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."reject_reason" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."routing" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."shift_instance" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."site" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."site_class" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."site_shift" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."time_conversion" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."unit_of_measurement" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."work_center" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."work_center_class" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."work_unit" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."work_unit_class" SET SCHEMA "master_data";--> statement-breakpoint
ALTER TABLE "public"."work_unit_kpi_binding" SET SCHEMA "master_data";
