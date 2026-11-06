-- PRD-003 KPI-007 rule 7 / KPI-014 (PO 2026-11-03, F-07.1 point c): the Weight output
-- input of the Shopfloor report. Data only, no schema change: the new tag role
-- `weight_output` is text, so no enum changes. Adds the one slot
-- `shopfloor.weight_output` (bindable, optional) and its KPI_PARAMETERS row
-- kp-22 (role weight_output, transform unit_convert), for every region and tenant
-- that already has the KPI catalog. Re-running is safe (ON CONFLICT DO NOTHING).
-- NOT RUN by the implementor: the router runs this file.
INSERT INTO "master_data"."kpi_formula_slot"
  ("slot_id", "region", "tenant_id", "domain", "metric", "iso_element", "bindable", "required")
SELECT 'shopfloor.weight_output', s."region", s."tenant_id", 'production', 'shopfloor', NULL, true, false
FROM (
  SELECT DISTINCT "region", "tenant_id" FROM "master_data"."kpi_formula_slot"
) AS s
ON CONFLICT ("slot_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "master_data"."kpi_parameter"
  ("parameter_id", "region", "tenant_id", "slot_id", "tag_role", "transform", "rank", "valid_from", "valid_to")
SELECT 'kp-22', s."region", s."tenant_id", 'shopfloor.weight_output', 'weight_output', 'unit_convert', NULL, '2026-01-01', NULL
FROM (
  SELECT DISTINCT "region", "tenant_id" FROM "master_data"."kpi_formula_slot"
) AS s
ON CONFLICT ("parameter_id") DO NOTHING;
