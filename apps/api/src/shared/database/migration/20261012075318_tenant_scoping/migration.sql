CREATE TABLE "master_data"."tenant" (
	"tenant_id" text PRIMARY KEY,
	"tenant_code" text NOT NULL,
	"tenant_name" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "master_data"."asset_class" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."asset_type" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."asset" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."asset_placement" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."asset_tags" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."asset_product_code" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."asset_product_code_change" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."audit_log" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."data_source" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."downtime_action" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."enterprise" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."site_class" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."area_class" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."work_center_class" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."work_unit_class" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."site" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."area" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."work_center" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."work_unit" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."equipment_flow" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."kpi_formula_slot" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."kpi_parameter" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."work_unit_kpi_binding" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."work_unit_kpi_binding_change" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."product" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."product_detail" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."product_uom_conversion" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."product_uom_measurement" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."downtime_reason" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."downtime_reason_asset" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."reject_reason" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."reject_reason_asset" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."enterprise_shift" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."site_shift" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."shift_instance" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."fiscal_year" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."measurement_group" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."unit_of_measurement" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."time_conversion" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."product_flow" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."bom" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."bom_line" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."routing" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."operation" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."operation_work_unit" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."operation_dependency" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."operation_instruction" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."operation_check" ADD COLUMN "tenant_id" text;--> statement-breakpoint
CREATE INDEX "asset_class_tenant_idx" ON "master_data"."asset_class" ("tenant_id");--> statement-breakpoint
CREATE INDEX "asset_type_tenant_idx" ON "master_data"."asset_type" ("tenant_id");--> statement-breakpoint
CREATE INDEX "asset_tenant_idx" ON "master_data"."asset" ("tenant_id");--> statement-breakpoint
CREATE INDEX "asset_placement_tenant_idx" ON "master_data"."asset_placement" ("tenant_id");--> statement-breakpoint
CREATE INDEX "asset_tags_tenant_idx" ON "master_data"."asset_tags" ("tenant_id");--> statement-breakpoint
CREATE INDEX "asset_product_code_tenant_idx" ON "master_data"."asset_product_code" ("tenant_id");--> statement-breakpoint
CREATE INDEX "asset_product_code_change_tenant_idx" ON "master_data"."asset_product_code_change" ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_idx" ON "master_data"."audit_log" ("tenant_id");--> statement-breakpoint
CREATE INDEX "data_source_tenant_idx" ON "master_data"."data_source" ("tenant_id");--> statement-breakpoint
CREATE INDEX "downtime_action_tenant_idx" ON "master_data"."downtime_action" ("tenant_id");--> statement-breakpoint
CREATE INDEX "enterprise_tenant_idx" ON "master_data"."enterprise" ("tenant_id");--> statement-breakpoint
CREATE INDEX "site_class_tenant_idx" ON "master_data"."site_class" ("tenant_id");--> statement-breakpoint
CREATE INDEX "area_class_tenant_idx" ON "master_data"."area_class" ("tenant_id");--> statement-breakpoint
CREATE INDEX "work_center_class_tenant_idx" ON "master_data"."work_center_class" ("tenant_id");--> statement-breakpoint
CREATE INDEX "work_unit_class_tenant_idx" ON "master_data"."work_unit_class" ("tenant_id");--> statement-breakpoint
CREATE INDEX "site_tenant_idx" ON "master_data"."site" ("tenant_id");--> statement-breakpoint
CREATE INDEX "area_tenant_idx" ON "master_data"."area" ("tenant_id");--> statement-breakpoint
CREATE INDEX "work_center_tenant_idx" ON "master_data"."work_center" ("tenant_id");--> statement-breakpoint
CREATE INDEX "work_unit_tenant_idx" ON "master_data"."work_unit" ("tenant_id");--> statement-breakpoint
CREATE INDEX "equipment_flow_tenant_idx" ON "master_data"."equipment_flow" ("tenant_id");--> statement-breakpoint
CREATE INDEX "kpi_formula_slot_tenant_idx" ON "master_data"."kpi_formula_slot" ("tenant_id");--> statement-breakpoint
CREATE INDEX "kpi_parameter_tenant_idx" ON "master_data"."kpi_parameter" ("tenant_id");--> statement-breakpoint
CREATE INDEX "work_unit_kpi_binding_tenant_idx" ON "master_data"."work_unit_kpi_binding" ("tenant_id");--> statement-breakpoint
CREATE INDEX "work_unit_kpi_binding_change_tenant_idx" ON "master_data"."work_unit_kpi_binding_change" ("tenant_id");--> statement-breakpoint
CREATE INDEX "product_tenant_idx" ON "master_data"."product" ("tenant_id");--> statement-breakpoint
CREATE INDEX "product_detail_tenant_idx" ON "master_data"."product_detail" ("tenant_id");--> statement-breakpoint
CREATE INDEX "product_uom_conversion_tenant_idx" ON "master_data"."product_uom_conversion" ("tenant_id");--> statement-breakpoint
CREATE INDEX "product_uom_measurement_tenant_idx" ON "master_data"."product_uom_measurement" ("tenant_id");--> statement-breakpoint
CREATE INDEX "downtime_reason_tenant_idx" ON "master_data"."downtime_reason" ("tenant_id");--> statement-breakpoint
CREATE INDEX "downtime_reason_asset_tenant_idx" ON "master_data"."downtime_reason_asset" ("tenant_id");--> statement-breakpoint
CREATE INDEX "reject_reason_tenant_idx" ON "master_data"."reject_reason" ("tenant_id");--> statement-breakpoint
CREATE INDEX "reject_reason_asset_tenant_idx" ON "master_data"."reject_reason_asset" ("tenant_id");--> statement-breakpoint
CREATE INDEX "enterprise_shift_tenant_idx" ON "master_data"."enterprise_shift" ("tenant_id");--> statement-breakpoint
CREATE INDEX "site_shift_tenant_idx" ON "master_data"."site_shift" ("tenant_id");--> statement-breakpoint
CREATE INDEX "shift_instance_tenant_idx" ON "master_data"."shift_instance" ("tenant_id");--> statement-breakpoint
CREATE INDEX "fiscal_year_tenant_idx" ON "master_data"."fiscal_year" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_code_key" ON "master_data"."tenant" ("tenant_code");--> statement-breakpoint
CREATE INDEX "measurement_group_tenant_idx" ON "master_data"."measurement_group" ("tenant_id");--> statement-breakpoint
CREATE INDEX "unit_of_measurement_tenant_idx" ON "master_data"."unit_of_measurement" ("tenant_id");--> statement-breakpoint
CREATE INDEX "time_conversion_tenant_idx" ON "master_data"."time_conversion" ("tenant_id");--> statement-breakpoint
CREATE INDEX "product_flow_tenant_idx" ON "master_data"."product_flow" ("tenant_id");--> statement-breakpoint
CREATE INDEX "bom_tenant_idx" ON "master_data"."bom" ("tenant_id");--> statement-breakpoint
CREATE INDEX "bom_line_tenant_idx" ON "master_data"."bom_line" ("tenant_id");--> statement-breakpoint
CREATE INDEX "routing_tenant_idx" ON "master_data"."routing" ("tenant_id");--> statement-breakpoint
CREATE INDEX "operation_tenant_idx" ON "master_data"."operation" ("tenant_id");--> statement-breakpoint
CREATE INDEX "operation_work_unit_tenant_idx" ON "master_data"."operation_work_unit" ("tenant_id");--> statement-breakpoint
CREATE INDEX "operation_dependency_tenant_idx" ON "master_data"."operation_dependency" ("tenant_id");--> statement-breakpoint
CREATE INDEX "operation_instruction_tenant_idx" ON "master_data"."operation_instruction" ("tenant_id");--> statement-breakpoint
CREATE INDEX "operation_check_tenant_idx" ON "master_data"."operation_check" ("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."asset_class" ADD CONSTRAINT "asset_class_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."asset_type" ADD CONSTRAINT "asset_type_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."asset" ADD CONSTRAINT "asset_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."asset_placement" ADD CONSTRAINT "asset_placement_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."asset_tags" ADD CONSTRAINT "asset_tags_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."asset_product_code" ADD CONSTRAINT "asset_product_code_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."asset_product_code_change" ADD CONSTRAINT "asset_product_code_change_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."data_source" ADD CONSTRAINT "data_source_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."downtime_action" ADD CONSTRAINT "downtime_action_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."enterprise" ADD CONSTRAINT "enterprise_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."site_class" ADD CONSTRAINT "site_class_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."area_class" ADD CONSTRAINT "area_class_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."work_center_class" ADD CONSTRAINT "work_center_class_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."work_unit_class" ADD CONSTRAINT "work_unit_class_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."site" ADD CONSTRAINT "site_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."area" ADD CONSTRAINT "area_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."work_center" ADD CONSTRAINT "work_center_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."work_unit" ADD CONSTRAINT "work_unit_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."equipment_flow" ADD CONSTRAINT "equipment_flow_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."kpi_formula_slot" ADD CONSTRAINT "kpi_formula_slot_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."kpi_parameter" ADD CONSTRAINT "kpi_parameter_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."work_unit_kpi_binding" ADD CONSTRAINT "work_unit_kpi_binding_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."work_unit_kpi_binding_change" ADD CONSTRAINT "work_unit_kpi_binding_change_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."product" ADD CONSTRAINT "product_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."product_detail" ADD CONSTRAINT "product_detail_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."product_uom_conversion" ADD CONSTRAINT "product_uom_conversion_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."product_uom_measurement" ADD CONSTRAINT "product_uom_measurement_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."downtime_reason" ADD CONSTRAINT "downtime_reason_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."downtime_reason_asset" ADD CONSTRAINT "downtime_reason_asset_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."reject_reason" ADD CONSTRAINT "reject_reason_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."reject_reason_asset" ADD CONSTRAINT "reject_reason_asset_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."enterprise_shift" ADD CONSTRAINT "enterprise_shift_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."site_shift" ADD CONSTRAINT "site_shift_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."shift_instance" ADD CONSTRAINT "shift_instance_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."fiscal_year" ADD CONSTRAINT "fiscal_year_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."measurement_group" ADD CONSTRAINT "measurement_group_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."unit_of_measurement" ADD CONSTRAINT "unit_of_measurement_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."time_conversion" ADD CONSTRAINT "time_conversion_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."product_flow" ADD CONSTRAINT "product_flow_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."bom" ADD CONSTRAINT "bom_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."bom_line" ADD CONSTRAINT "bom_line_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."routing" ADD CONSTRAINT "routing_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."operation" ADD CONSTRAINT "operation_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."operation_work_unit" ADD CONSTRAINT "operation_work_unit_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."operation_dependency" ADD CONSTRAINT "operation_dependency_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."operation_instruction" ADD CONSTRAINT "operation_instruction_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");--> statement-breakpoint
ALTER TABLE "master_data"."operation_check" ADD CONSTRAINT "operation_check_tenant_id_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "master_data"."tenant"("tenant_id");