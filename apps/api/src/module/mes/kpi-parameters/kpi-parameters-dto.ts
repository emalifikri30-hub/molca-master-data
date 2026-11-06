import * as z from "zod";

import { paginationSchema, queryValidator } from "@molca/helper";

import { TAG_ROLES } from "../asset-tags/asset-tags.js";

import type { TagRole } from "../asset-tags/asset-tags.js";

const listSchema = paginationSchema.extend({
  slotId: z.string().optional(),
  tagRole: z.enum(TAG_ROLES as [TagRole, ...TagRole[]]).optional(),
});

const kpiParametersValidator = {
  list: queryValidator(listSchema),
};

export { kpiParametersValidator };
