-- PRD-003 §7.2 / F-00 keys rule 4 (PO 2026-10-02, prd-molcadx#24 item 11, E-1 resolved):
-- "No overlap" is a database exclusion constraint on the half-open validity range
-- `daterange(valid_from, valid_to, '[)')`, not an application check — two saves
-- running at the same time can each pass an app check and still overlap.
-- One constraint per "No overlap" line in the entities' Keys (F-02, F-04, F-06,
-- F-07.1, F-08). Rules whose scope is reached through a join (asset_tag address,
-- asset_product_code by asset) stay application checks, as their Keys lines say.
-- The service checks stay too: they give the screen its named refusal first.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

-- F-02 §9.2 SITE_SHIFT: one active row per (site_id, enterprise_shift_id).
ALTER TABLE "site_shift" ADD CONSTRAINT "site_shift_no_overlap"
  EXCLUDE USING gist ("site_id" WITH =, "enterprise_shift_id" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&);--> statement-breakpoint

-- F-04 §9.6 ASSET_PLACEMENT: at most one primary per work unit, and one row per
-- (work unit, asset) in any role.
ALTER TABLE "asset_placement" ADD CONSTRAINT "asset_placement_one_primary"
  EXCLUDE USING gist ("work_unit_id" WITH =, daterange("valid_from", "valid_to", '[)') WITH &&)
  WHERE ("placement_role" = 'primary');--> statement-breakpoint
ALTER TABLE "asset_placement" ADD CONSTRAINT "asset_placement_no_overlap"
  EXCLUDE USING gist ("work_unit_id" WITH =, "asset_id" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&);--> statement-breakpoint

-- F-04 §9.7 ASSET_TAGS: (asset_id, tag_name) among active rows. Rows from before
-- `tag_name` was required carry '' and are left out.
ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_name_no_overlap"
  EXCLUDE USING gist ("asset_id" WITH =, "tag_name" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&)
  WHERE ("tag_name" <> '');--> statement-breakpoint

-- F-06 §9.2 PRODUCT_DETAIL: one active row per product (1:1, effective-dated).
ALTER TABLE "product_detail" ADD CONSTRAINT "product_detail_no_overlap"
  EXCLUDE USING gist ("product_id" WITH =, daterange("valid_from", "valid_to", '[)') WITH &&);--> statement-breakpoint

-- F-07.1 §9.4 WORK_UNIT_KPI_BINDING (K-13): one main row per (work unit, slot);
-- reason_match_enrich rows and quality.reject rows may overlap.
ALTER TABLE "work_unit_kpi_binding" ADD CONSTRAINT "work_unit_kpi_binding_main_no_overlap"
  EXCLUDE USING gist ("work_unit_id" WITH =, "slot_id" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&)
  WHERE ("transform" <> 'reason_match_enrich' AND "slot_id" <> 'quality.reject');--> statement-breakpoint

-- F-08 PRODUCT_FLOW: exactly one primary flow per product on any date.
ALTER TABLE "product_flow" ADD CONSTRAINT "product_flow_one_primary"
  EXCLUDE USING gist ("product_id" WITH =, daterange("valid_from", "valid_to", '[)') WITH &&)
  WHERE ("is_primary");--> statement-breakpoint

-- F-08 §9.1 ROUTING: at most one released version, and one primary routing, per
-- (flow, work center) on any date. A draft copy keeps the primary flag and has no
-- force until released, so drafts are left out of the primary rule.
ALTER TABLE "routing" ADD CONSTRAINT "routing_one_released"
  EXCLUDE USING gist ("flow_id" WITH =, "work_center_id" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&)
  WHERE ("status" = 'released');--> statement-breakpoint
ALTER TABLE "routing" ADD CONSTRAINT "routing_one_primary"
  EXCLUDE USING gist ("flow_id" WITH =, "work_center_id" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&)
  WHERE ("is_primary" AND "status" <> 'draft');--> statement-breakpoint

-- F-08 §9.2 OPERATION (W-18 closed): one active row per step. This app keeps a
-- step's id across routing versions (a draft copy keeps step ids so BOM entry
-- steps survive), so the step is (routing_id, step_id) here.
ALTER TABLE "operation" ADD CONSTRAINT "operation_step_no_overlap"
  EXCLUDE USING gist ("routing_id" WITH =, "step_id" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&);--> statement-breakpoint

-- F-08 §9.2.2 OPERATION_WORK_UNIT: one active row per (step, station).
ALTER TABLE "operation_work_unit" ADD CONSTRAINT "operation_work_unit_no_overlap"
  EXCLUDE USING gist ("routing_id" WITH =, "step_id" WITH =, "work_unit_id" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&);--> statement-breakpoint

-- F-08 §9.2.5 OPERATION_INSTRUCTION: (step, sequence) on any date.
ALTER TABLE "operation_instruction" ADD CONSTRAINT "operation_instruction_no_overlap"
  EXCLUDE USING gist ("routing_id" WITH =, "step_id" WITH =, "sequence" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&);--> statement-breakpoint

-- F-08 §9.2.6 OPERATION_CHECK: (step, check_name) on any date.
ALTER TABLE "operation_check" ADD CONSTRAINT "operation_check_no_overlap"
  EXCLUDE USING gist ("routing_id" WITH =, "step_id" WITH =, "check_name" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&);--> statement-breakpoint

-- F-08 §9.3 BOM: at most one released version per flow on any date, and at most
-- one draft per flow (PO 2026-10-02, prd-molcadx#24 item 19).
ALTER TABLE "bom" ADD CONSTRAINT "bom_one_released"
  EXCLUDE USING gist ("flow_id" WITH =, daterange("valid_from", "valid_to", '[)') WITH &&)
  WHERE ("status" = 'released');--> statement-breakpoint
CREATE UNIQUE INDEX "bom_one_draft" ON "bom" ("flow_id") WHERE ("status" = 'draft');
