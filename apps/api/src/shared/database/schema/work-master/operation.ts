import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, datingDays, scopeIdx } from "../columns.js";

export const operationTable = masterData.table(
  "operation",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    stepId: p.text("step_id").notNull(),
    routingId: p.text("routing_id").notNull(),
    stepNumber: p.integer("step_number").notNull(),
    stepName: p.text("step_name").notNull(),
    stepType: p.text("step_type"),
    workUnitId: p.text("work_unit_id"),
    requiredWorkUnitClassId: p.text("required_work_unit_class_id"),
    cycleTimeValue: p.doublePrecision("cycle_time_value"),
    uomId: p.text("uom_id").notNull(),
    timeConversionId: p.text("time_conversion_id").notNull(),
    batchSize: p.doublePrecision("batch_size"),
    standardSpeedValue: p.doublePrecision("standard_speed_value"),
    speedUomId: p.text("speed_uom_id"),
    standardSetupTime: p.doublePrecision("standard_setup_time"),
    setupTimeConversionId: p.text("setup_time_conversion_id"),
    crewSize: p.doublePrecision("crew_size"),
    plannedShrinkage: p.doublePrecision("planned_shrinkage"),
    yieldMinPct: p.doublePrecision("yield_min_pct"),
    yieldMaxPct: p.doublePrecision("yield_max_pct"),
    maxHoldTime: p.doublePrecision("max_hold_time"),
    holdTimeConversionId: p.text("hold_time_conversion_id"),
    ...datingDays(),
  },
  scopeIdx("operation"),
);
