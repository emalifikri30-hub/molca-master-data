import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";

import { COUNT_BASES, COUNT_SIDES, TAG_KINDS, TAG_ROLES } from "./asset-tags.js";

import type { CountBasis, CountSide, TagKind, TagRole } from "./asset-tags.js";

const listSchema = paginationSchema.extend({
  assetId: z.string().optional(),
});

const createSchema = z.object({
  assetId: z.string().min(1),
  // F-04 §9.7: required FK into DATA_SOURCE (F-13 §9.1) — was `.default("")`
  // before that module existed, which let every tag point at no connection.
  dataSourceId: z.string().min(1),
  // DSR-001 rule 8 (`dsr-001.error.tag-name-chars`).
  tagName: z.string().regex(/^[A-Za-z0-9_]+$/, "Use only letters, numbers and _ in the tag name."),
  // Empty is legal here: on a `generated` source the address is derived, never
  // stored (rule 9). Whether a node is *required* depends on the source's
  // naming, so AssetTagsService.assertAddressRules enforces it — the DTO only
  // shapes the payload.
  node: z.string().default(""),
  workUnitId: z.string().default(""),
  kind: z.enum(TAG_KINDS as [TagKind, ...TagKind[]]),
  tagRole: z.enum(TAG_ROLES as [TagRole, ...TagRole[]]),
  rejectReasonId: z.string().default(""),
  downtimeReasonId: z.string().default(""),
  uomId: z.string().default(""),
  countBasis: z
    .enum([...(COUNT_BASES as [CountBasis, ...CountBasis[]]), ""] as [
      CountBasis | "",
      ...Array<CountBasis | "">,
    ])
    .default(""),
  countSide: z
    .enum([...(COUNT_SIDES as [CountSide, ...CountSide[]]), ""] as [
      CountSide | "",
      ...Array<CountSide | "">,
    ])
    .optional(),
  validFrom: z.string().min(1),
});

const updateSchema = createSchema.partial().extend({
  validTo: z.string().nullable().optional(),
});

const assetTagsValidator = {
  list: queryValidator(listSchema),
  create: jsonValidator(createSchema),
  update: jsonValidator(updateSchema),
};

export { assetTagsValidator };
