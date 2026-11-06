import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, datingDays, scopeIdx } from "../columns.js";

export const operationCheckTable = masterData.table(
  "operation_check",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    checkId: p.text("check_id").notNull(),
    routingId: p.text("routing_id").notNull(),
    stepId: p.text("step_id").notNull(),
    sequence: p.integer("sequence").notNull(),
    checkName: p.text("check_name").notNull(),
    valueType: p.text("value_type").notNull(),
    targetValue: p.doublePrecision("target_value"),
    minValue: p.doublePrecision("min_value"),
    maxValue: p.doublePrecision("max_value"),
    uomId: p.text("uom_id"),
    sampleCount: p.integer("sample_count").notNull(),
    frequencyType: p.text("frequency_type").notNull(),
    frequencyIntervalValue: p.doublePrecision("frequency_interval_value"),
    frequencyIntervalConversionId: p.text("frequency_interval_conversion_id"),
    isCritical: p.boolean("is_critical").notNull(),
    ...datingDays(),
  },
  scopeIdx("operation_check"),
);
