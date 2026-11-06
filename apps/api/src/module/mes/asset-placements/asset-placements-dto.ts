import * as z from "zod";

import { jsonValidator, paginationSchema, queryValidator } from "@molca/helper";

import { PLACEMENT_ROLES } from "./asset-placements.js";

import type { PlacementRole } from "./asset-placements.js";

const listSchema = paginationSchema.extend({
  workUnitId: z.string().optional(),
});

const createSchema = z.object({
  assetId: z.string().min(1),
  workUnitId: z.string().min(1),
  placementRole: z.enum(PLACEMENT_ROLES as [PlacementRole, ...PlacementRole[]]),
  validFrom: z.string().min(1),
  replace: z.boolean().optional(),
  mode: z.enum(["move", "add_lane"]).optional(),
});

const closeSchema = z.object({
  validTo: z.string().min(1),
});

const changeRoleSchema = z.object({
  placementRole: z.enum(PLACEMENT_ROLES as [PlacementRole, ...PlacementRole[]]),
  validFrom: z.string().min(1),
  replace: z.boolean().optional(),
});

const assetPlacementsValidator = {
  list: queryValidator(listSchema),
  create: jsonValidator(createSchema),
  close: jsonValidator(closeSchema),
  changeRole: jsonValidator(changeRoleSchema),
};

export { assetPlacementsValidator };
