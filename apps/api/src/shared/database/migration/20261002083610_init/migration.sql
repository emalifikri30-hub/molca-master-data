CREATE TABLE "comments" (
	"id" varchar(26) PRIMARY KEY,
	"region" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"post_id" varchar(26) NOT NULL,
	"name" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" varchar(26) PRIMARY KEY,
	"region" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content" varchar(255) NOT NULL,
	"mediaUrl" text NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "area_class" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "area" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"site_id" text NOT NULL,
	"area_class_id" text DEFAULT '' NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "asset_class" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"parent_class_id" text DEFAULT '' NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "asset_placement" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asset_id" text NOT NULL,
	"work_unit_id" text NOT NULL,
	"placement_role" text NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "asset_product_code" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tag_id" text NOT NULL,
	"raw_value" text NOT NULL,
	"product_id" text NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "asset" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asset_tag" text NOT NULL,
	"asset_name" text DEFAULT '' NOT NULL,
	"asset_type_id" text DEFAULT '' NOT NULL,
	"serial_number" text DEFAULT '' NOT NULL,
	"parent_asset_id" text DEFAULT '' NOT NULL,
	"component_level" text NOT NULL,
	"lifecycle_status" text NOT NULL,
	"commissioning_date" text DEFAULT '' NOT NULL,
	"attributes" jsonb DEFAULT '{}' NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "asset_tags" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asset_id" text NOT NULL,
	"data_source_id" text NOT NULL,
	"tag_name" text DEFAULT '' NOT NULL,
	"node" text NOT NULL,
	"work_unit_id" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"tag_role" text NOT NULL,
	"reject_reason_id" text DEFAULT '' NOT NULL,
	"downtime_reason_id" text DEFAULT '' NOT NULL,
	"uom_id" text DEFAULT '' NOT NULL,
	"count_basis" text DEFAULT '' NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "asset_type" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asset_class_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"manufacturer" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"attributes" jsonb DEFAULT '{}' NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurred_at" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_code" text DEFAULT '' NOT NULL,
	"previous_version_entity_id" text,
	"effective_from" text,
	"effective_to" text,
	"changes" jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"domain_code" text NOT NULL,
	"module_code" text NOT NULL,
	"import_batch_id" text,
	"transaction_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_subject_id" text NOT NULL,
	"actor_display_name" text NOT NULL,
	"site_id" text,
	"download_filter" text,
	"download_row_count" integer
);
--> statement-breakpoint
CREATE TABLE "bom_line" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bom_id" text NOT NULL,
	"component_product_id" text NOT NULL,
	"operation_id" text,
	"line_use" text NOT NULL,
	"is_primary_output" boolean,
	"qty_per_unit" double precision NOT NULL,
	"uom_id" text NOT NULL,
	"scrap_factor" double precision NOT NULL,
	"dispense_tolerance_type" text,
	"dispense_tolerance_value" double precision,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "bom" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" text NOT NULL,
	"flow_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"base_qty" double precision NOT NULL,
	"base_uom_id" text NOT NULL,
	"is_phantom" boolean NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "data_source" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"protocol" text NOT NULL,
	"node_naming" text NOT NULL,
	"namespace_uri" text DEFAULT '' NOT NULL,
	"topic_root" text DEFAULT '' NOT NULL,
	"connection_config" jsonb DEFAULT '{}' NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "downtime_reason" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"downtime_category" text NOT NULL,
	"deleted_at" text
);
--> statement-breakpoint
CREATE TABLE "enterprise_shift" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"label" text NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "enterprise" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "equipment_flow" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"work_center_id" text NOT NULL,
	"from_work_unit_id" text NOT NULL,
	"to_work_unit_id" text NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "fiscal_year" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"label" text NOT NULL,
	"calendar_basis" text NOT NULL,
	"start_month" integer,
	"end_month" integer,
	"period_pattern" text,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"lineage_id" text NOT NULL,
	"previous_version_id" text,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "kpi_formula_slot" (
	"slot_id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"domain" text NOT NULL,
	"metric" text NOT NULL,
	"iso_element" text,
	"bindable" boolean NOT NULL,
	"required" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_parameter" (
	"parameter_id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slot_id" text NOT NULL,
	"tag_role" text NOT NULL,
	"transform" text NOT NULL,
	"rank" integer,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "measurement_group" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_check" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"check_id" text NOT NULL,
	"routing_id" text NOT NULL,
	"step_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"check_name" text NOT NULL,
	"value_type" text NOT NULL,
	"target_value" double precision,
	"min_value" double precision,
	"max_value" double precision,
	"uom_id" text,
	"sample_count" integer NOT NULL,
	"frequency_type" text NOT NULL,
	"frequency_interval_value" double precision,
	"frequency_interval_conversion_id" text,
	"is_critical" boolean NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "operation_dependency" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"routing_id" text NOT NULL,
	"step_id" text NOT NULL,
	"predecessor_step_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_instruction" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"instruction_id" text NOT NULL,
	"routing_id" text NOT NULL,
	"step_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"instruction_text" text NOT NULL,
	"requires_confirmation" boolean NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "operation" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"step_id" text NOT NULL,
	"routing_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"step_name" text NOT NULL,
	"step_type" text,
	"work_unit_id" text,
	"required_work_unit_class_id" text,
	"cycle_time_value" double precision,
	"uom_id" text NOT NULL,
	"time_conversion_id" text NOT NULL,
	"batch_size" double precision,
	"standard_speed_value" double precision,
	"speed_uom_id" text,
	"standard_setup_time" double precision,
	"setup_time_conversion_id" text,
	"crew_size" double precision,
	"planned_shrinkage" double precision,
	"yield_min_pct" double precision,
	"yield_max_pct" double precision,
	"max_hold_time" double precision,
	"hold_time_conversion_id" text,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "operation_work_unit" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"routing_id" text NOT NULL,
	"step_id" text NOT NULL,
	"work_unit_id" text NOT NULL,
	"cycle_time_value" double precision,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "product_detail" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" text NOT NULL,
	"min_weight" double precision NOT NULL,
	"max_weight" double precision NOT NULL,
	"standard_weight" double precision NOT NULL,
	"weight_uom_id" text NOT NULL,
	"length" double precision,
	"width" double precision,
	"height" double precision,
	"barcode" text,
	"is_batch_tracked" boolean DEFAULT false NOT NULL,
	"shelf_life_days" integer,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "product_flow" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" text NOT NULL,
	"flow_code" text NOT NULL,
	"flow_name" text NOT NULL,
	"is_primary" boolean NOT NULL,
	"status" text NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"product_type" text NOT NULL,
	"packaging_level" text,
	"base_uom_id" text NOT NULL,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "product_uom_conversion" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" text NOT NULL,
	"from_uom_id" text NOT NULL,
	"to_uom_id" text NOT NULL,
	"conversion_value" double precision NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "reason_asset" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"reason_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"deleted_at" text
);
--> statement-breakpoint
CREATE TABLE "reject_reason" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"deleted_at" text
);
--> statement-breakpoint
CREATE TABLE "routing" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" text NOT NULL,
	"work_center_id" text NOT NULL,
	"flow_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"is_primary" boolean NOT NULL,
	"enforce_sequence" boolean NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "shift_instance" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"site_shift_id" text NOT NULL,
	"site_id" text NOT NULL,
	"enterprise_shift_id" text NOT NULL,
	"business_date" text NOT NULL,
	"start_datetime" text NOT NULL,
	"end_datetime" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_class" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "site_shift" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enterprise_shift_id" text NOT NULL,
	"site_id" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "site" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enterprise_id" text NOT NULL,
	"site_class_id" text DEFAULT '' NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "time_conversion" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"seconds_per_unit" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_of_measurement" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"measurement_group_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_center_class" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "work_center" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"area_id" text NOT NULL,
	"work_center_class_id" text DEFAULT '' NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"work_center_type" text NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "work_unit_class" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE TABLE "work_unit_kpi_binding" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"work_unit_id" text NOT NULL,
	"slot_id" text NOT NULL,
	"asset_tag_id" text NOT NULL,
	"transform" text NOT NULL,
	"second_asset_tag_id" text,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "work_unit" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"work_center_id" text NOT NULL,
	"work_unit_class_id" text DEFAULT '' NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"valid_from" text,
	"valid_to" text
);
--> statement-breakpoint
CREATE INDEX "comments_region_org_updated_idx" ON "comments" ("region","updated_at");--> statement-breakpoint
CREATE INDEX "comments_user_id_idx" ON "comments" ("user_id");--> statement-breakpoint
CREATE INDEX "comments_post_id_idx" ON "comments" ("post_id");--> statement-breakpoint
CREATE INDEX "posts_region_org_updated_idx" ON "posts" ("region","updated_at");--> statement-breakpoint
CREATE INDEX "posts_user_id_idx" ON "posts" ("user_id");--> statement-breakpoint
CREATE INDEX "area_class_region_idx" ON "area_class" ("region");--> statement-breakpoint
CREATE INDEX "area_region_idx" ON "area" ("region");--> statement-breakpoint
CREATE INDEX "asset_class_region_idx" ON "asset_class" ("region");--> statement-breakpoint
CREATE INDEX "asset_placement_region_idx" ON "asset_placement" ("region");--> statement-breakpoint
CREATE INDEX "asset_product_code_region_idx" ON "asset_product_code" ("region");--> statement-breakpoint
CREATE INDEX "asset_region_idx" ON "asset" ("region");--> statement-breakpoint
CREATE INDEX "asset_tags_region_idx" ON "asset_tags" ("region");--> statement-breakpoint
CREATE INDEX "asset_type_region_idx" ON "asset_type" ("region");--> statement-breakpoint
CREATE INDEX "audit_log_region_idx" ON "audit_log" ("region");--> statement-breakpoint
CREATE INDEX "bom_line_region_idx" ON "bom_line" ("region");--> statement-breakpoint
CREATE INDEX "bom_region_idx" ON "bom" ("region");--> statement-breakpoint
CREATE INDEX "data_source_region_idx" ON "data_source" ("region");--> statement-breakpoint
CREATE INDEX "downtime_reason_region_idx" ON "downtime_reason" ("region");--> statement-breakpoint
CREATE INDEX "enterprise_shift_region_idx" ON "enterprise_shift" ("region");--> statement-breakpoint
CREATE INDEX "enterprise_region_idx" ON "enterprise" ("region");--> statement-breakpoint
CREATE INDEX "equipment_flow_region_idx" ON "equipment_flow" ("region");--> statement-breakpoint
CREATE INDEX "fiscal_year_region_idx" ON "fiscal_year" ("region");--> statement-breakpoint
CREATE INDEX "kpi_formula_slot_region_idx" ON "kpi_formula_slot" ("region");--> statement-breakpoint
CREATE INDEX "kpi_parameter_region_idx" ON "kpi_parameter" ("region");--> statement-breakpoint
CREATE INDEX "measurement_group_region_idx" ON "measurement_group" ("region");--> statement-breakpoint
CREATE INDEX "operation_check_region_idx" ON "operation_check" ("region");--> statement-breakpoint
CREATE INDEX "operation_dependency_region_idx" ON "operation_dependency" ("region");--> statement-breakpoint
CREATE INDEX "operation_instruction_region_idx" ON "operation_instruction" ("region");--> statement-breakpoint
CREATE INDEX "operation_region_idx" ON "operation" ("region");--> statement-breakpoint
CREATE INDEX "operation_work_unit_region_idx" ON "operation_work_unit" ("region");--> statement-breakpoint
CREATE INDEX "product_detail_region_idx" ON "product_detail" ("region");--> statement-breakpoint
CREATE INDEX "product_flow_region_idx" ON "product_flow" ("region");--> statement-breakpoint
CREATE INDEX "product_region_idx" ON "product" ("region");--> statement-breakpoint
CREATE INDEX "product_uom_conversion_region_idx" ON "product_uom_conversion" ("region");--> statement-breakpoint
CREATE INDEX "reason_asset_region_idx" ON "reason_asset" ("region");--> statement-breakpoint
CREATE INDEX "reject_reason_region_idx" ON "reject_reason" ("region");--> statement-breakpoint
CREATE INDEX "routing_region_idx" ON "routing" ("region");--> statement-breakpoint
CREATE INDEX "shift_instance_region_idx" ON "shift_instance" ("region");--> statement-breakpoint
CREATE INDEX "site_class_region_idx" ON "site_class" ("region");--> statement-breakpoint
CREATE INDEX "site_shift_region_idx" ON "site_shift" ("region");--> statement-breakpoint
CREATE INDEX "site_region_idx" ON "site" ("region");--> statement-breakpoint
CREATE INDEX "time_conversion_region_idx" ON "time_conversion" ("region");--> statement-breakpoint
CREATE INDEX "unit_of_measurement_region_idx" ON "unit_of_measurement" ("region");--> statement-breakpoint
CREATE INDEX "work_center_class_region_idx" ON "work_center_class" ("region");--> statement-breakpoint
CREATE INDEX "work_center_region_idx" ON "work_center" ("region");--> statement-breakpoint
CREATE INDEX "work_unit_class_region_idx" ON "work_unit_class" ("region");--> statement-breakpoint
CREATE INDEX "work_unit_kpi_binding_region_idx" ON "work_unit_kpi_binding" ("region");--> statement-breakpoint
CREATE INDEX "work_unit_region_idx" ON "work_unit" ("region");