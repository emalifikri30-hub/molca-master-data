ALTER TABLE "master_data"."audit_log" ADD COLUMN "enterprise_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."audit_log" ADD COLUMN "area_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."audit_log" ADD COLUMN "work_center_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."audit_log" ADD COLUMN "work_unit_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."audit_log" ADD COLUMN "scope_level" text DEFAULT 'tenant' NOT NULL;