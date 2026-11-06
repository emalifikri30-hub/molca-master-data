-- PRD-003 WMS-002 (PO 2026-10-02, prd-molcadx#26 item 1, F-08 §9.4, W-21 closed):
-- BOM_LINE names the step a line enters or comes out at by `step_id`, the step's
-- identity that carries over standard changes and routing versions. The column
-- always held a step id; only its name changes. No data moves.
ALTER TABLE "bom_line" RENAME COLUMN "operation_id" TO "step_id";
