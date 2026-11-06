import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";

const listSchema = paginationSchema.extend({
  tagId: z.string().optional(),
  productId: z.string().optional(),
});

// Raw value and start may arrive empty: the service refuses them with
// `wms-007.error.required` (WMS-006 rule 4) instead of a bare 400.
const createSchema = z.object({
  tagId: z.string().min(1),
  rawValue: z.string(),
  productId: z.string().min(1),
  validFrom: z.string(),
  validTo: z.string().nullable().optional(),
});

// WMS-006 rule 9 (PO 2026-10-02): End and Delete need a reason; an empty one
// is refused by the service as `reason_required` (`wms-007.error.reason`).
const endSchema = z.object({
  validTo: z.string().min(1),
  reason: z.string().default(""),
});

// WMS-006 rule 5 (PO 2026-10-04): Edit = the row's new values from a chosen
// time; the reason travels like End's (`wms-007.edit.form`).
const editSchema = z.object({
  rawValue: z.string(),
  validTo: z.string().nullable().optional(),
  effectiveFrom: z.string(),
  reason: z.string().default(""),
});

const removeSchema = z.object({
  reason: z.string().default(""),
});

const resolveSchema = z.object({
  tagId: z.string().min(1),
  rawValue: z.string(),
  at: z.string().min(1),
});

const assetProductCodesValidator = {
  list: queryValidator(listSchema),
  create: jsonValidator(createSchema),
  end: jsonValidator(endSchema),
  edit: jsonValidator(editSchema),
  remove: jsonValidator(removeSchema),
  resolve: queryValidator(resolveSchema),
};

export { assetProductCodesValidator };
