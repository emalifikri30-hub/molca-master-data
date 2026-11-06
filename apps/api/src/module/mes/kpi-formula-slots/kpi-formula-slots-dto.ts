import * as z from "zod";

import { paginationSchema, queryValidator } from "@molca/helper";

import { SLOT_METRICS } from "./kpi-formula-slots.js";

import type { SlotMetric } from "./kpi-formula-slots.js";

const listSchema = paginationSchema.extend({
  metric: z.enum(SLOT_METRICS as [SlotMetric, ...SlotMetric[]]).optional(),
  bindable: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

const kpiFormulaSlotsValidator = {
  list: queryValidator(listSchema),
};

export { kpiFormulaSlotsValidator };
