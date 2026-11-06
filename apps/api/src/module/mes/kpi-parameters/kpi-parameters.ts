// FOUNDATION F-07.1 §9.3 `KPI_PARAMETERS` — which declared `tag_role`,
// processed by which transform, may fill a `KPI_FORMULA_SLOT`. Seeded by
// Product / foundation-domain, never implementor-writable (K-1/K-7), so this
// module is read-only: no create/update/delete endpoint exists.
import type { TagRole } from "../asset-tags/asset-tags.js";
import type { Transform } from "../kpi-formula-slots/kpi-formula-slots.js";

type KpiParameter = {
  parameterId: string;
  /** FK -> KPI_FORMULA_SLOT.slotId */
  slotId: string;
  tagRole: TagRole;
  transform: Transform;
  /** Priority where more than one combination is legal for the same slot; null = unranked. */
  rank: number | null;
  validFrom: string;
  /** null = still legal now. Deactivated, never hard-deleted. */
  validTo: string | null;
};

type KpiParameterFilter = {
  slotId?: string;
  tagRole?: TagRole;
};

export type { KpiParameter, KpiParameterFilter };
