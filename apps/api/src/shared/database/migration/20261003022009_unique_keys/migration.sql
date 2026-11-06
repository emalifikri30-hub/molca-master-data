ALTER TABLE "master_data"."shift_instance" ADD CONSTRAINT "shift_instance_site_shift_date_key" UNIQUE("site_shift_id","business_date");--> statement-breakpoint
ALTER TABLE "master_data"."product_flow" ADD CONSTRAINT "product_flow_product_code_key" UNIQUE("product_id","flow_code");--> statement-breakpoint
ALTER TABLE "master_data"."bom" ADD CONSTRAINT "bom_flow_version_key" UNIQUE("flow_id","version");--> statement-breakpoint
ALTER TABLE "master_data"."routing" ADD CONSTRAINT "routing_flow_wc_version_key" UNIQUE("flow_id","work_center_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "bom_line_one_primary_output" ON "master_data"."bom_line" ("bom_id","step_id") WHERE "line_use" = 'produced' AND "is_primary_output" = true;