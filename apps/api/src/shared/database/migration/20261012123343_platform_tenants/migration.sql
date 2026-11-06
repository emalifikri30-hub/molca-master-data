ALTER TABLE "master_data"."audit_log" ADD COLUMN "on_behalf_of_subject_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."audit_log" ADD COLUMN "on_behalf_of_display_name" text;--> statement-breakpoint
-- Hand-added (TNT-G15): existing codes become upper-case and names lose surrounding spaces
-- before the check and the name index apply. Two tenants that only differ by case make
-- this migration fail on purpose: rename one first.
UPDATE "master_data"."tenant" SET "tenant_code" = upper(btrim("tenant_code")), "tenant_name" = btrim("tenant_name") WHERE "tenant_code" <> upper(btrim("tenant_code")) OR "tenant_name" <> btrim("tenant_name");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_name_key" ON "master_data"."tenant" (lower(btrim("tenant_name")));--> statement-breakpoint
ALTER TABLE "master_data"."tenant" ADD CONSTRAINT "tenant_code_upper" CHECK ("tenant_code" = upper("tenant_code"));