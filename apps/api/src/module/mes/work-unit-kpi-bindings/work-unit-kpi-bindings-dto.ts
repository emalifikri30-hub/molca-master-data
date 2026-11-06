import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";

import { TRANSFORMS } from "../kpi-formula-slots/kpi-formula-slots.js";

import type { Transform } from "../kpi-formula-slots/kpi-formula-slots.js";

const listSchema = paginationSchema.extend({
  workUnitId: z.string().optional(),
  slotId: z.string().optional(),
});

const createSchema = z.object({
  workUnitId: z.string().min(1),
  slotId: z.string().min(1),
  assetTagId: z.string().min(1),
  transform: z.enum(TRANSFORMS as [Transform, ...Transform[]]),
  secondAssetTagId: z.string().optional(),
  validFrom: z.string().min(1),
  incumbentBindingId: z.string().optional(),
});

// PO 2026-11-04 (answer 6): one save of several rows, one effective date.
const batchSchema = z.object({
  workUnitId: z.string().min(1),
  validFrom: z.string().min(1),
  rows: z
    .array(
      z.object({
        slotId: z.string().min(1),
        assetTagId: z.string().min(1),
        transform: z.enum(TRANSFORMS as [Transform, ...Transform[]]),
        secondAssetTagId: z.string().optional(),
        incumbentBindingId: z.string().optional(),
      }),
    )
    .min(1),
});

// PUT may only close a row — never reopen it or change what it binds.
const updateSchema = z.object({
  validTo: z.string().min(1),
});

const workUnitKpiBindingsValidator = {
  list: queryValidator(listSchema),
  create: jsonValidator(createSchema),
  batch: jsonValidator(batchSchema),
  update: jsonValidator(updateSchema),
};

export { workUnitKpiBindingsValidator };
