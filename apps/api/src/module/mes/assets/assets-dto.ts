import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";

import { ASSET_NAME_MAX, ASSET_TAG_MAX, COMPONENT_LEVELS, LIFECYCLE_STATUSES } from "./assets.js";

import type { ComponentLevel, LifecycleStatus } from "./assets.js";

const listSchema = paginationSchema.extend({
  q: z.string().optional(),
});

// No siteId / workUnitId / ownerOrgUnitId (PRD-003 US-FND-AST-002 §5): the
// site is derived from ASSET_PLACEMENT and the owner FK target is TBD.
const createSchema = z.object({
  assetTag: z.string().trim().min(1).max(ASSET_TAG_MAX),
  assetName: z.string().trim().max(ASSET_NAME_MAX).default(""),
  assetTypeId: z.string().default(""),
  serialNumber: z.string().default(""),
  parentAssetId: z.string().default(""),
  componentLevel: z.enum(COMPONENT_LEVELS as [ComponentLevel, ...ComponentLevel[]]),
  lifecycleStatus: z.enum(LIFECYCLE_STATUSES as [LifecycleStatus, ...LifecycleStatus[]]),
  commissioningDate: z.string().default(""),
  attributes: z.record(z.string(), z.string()).default({}),
});

const updateSchema = z.object({
  assetTag: z.string().trim().min(1).max(ASSET_TAG_MAX).optional(),
  assetName: z.string().trim().max(ASSET_NAME_MAX).optional(),
  assetTypeId: z.string().optional(),
  serialNumber: z.string().optional(),
  parentAssetId: z.string().optional(),
  componentLevel: z.enum(COMPONENT_LEVELS as [ComponentLevel, ...ComponentLevel[]]).optional(),
  lifecycleStatus: z.enum(LIFECYCLE_STATUSES as [LifecycleStatus, ...LifecycleStatus[]]).optional(),
  commissioningDate: z.string().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
});

const assetsValidator = {
  list: queryValidator(listSchema),
  create: jsonValidator(createSchema),
  update: jsonValidator(updateSchema),
};

export { assetsValidator };
