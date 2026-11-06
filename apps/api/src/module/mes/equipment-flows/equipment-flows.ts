// Line topology (which position feeds which) is a WORK_UNIT_FLOW fact per
// FOUNDATION's work-unit-flow-draft.md: from/to point at WORK_UNITs (physical
// positions), not equipment (the machine currently occupying one — that's
// ASSET_PLACEMENT, and swapping it doesn't change the line's topology).
type EquipmentFlows = {
  id: string;
  workCenterId: string;
  fromWorkUnitId: string;
  toWorkUnitId: string;
  /** F-01: the edge holds from this date. */
  validFrom: string | null;
  /** null = in force. Ending an edge sets it; edges are never deleted. */
  validTo: string | null;
};

type CreateEquipmentFlows = {
  workCenterId: string;
  fromWorkUnitId: string;
  toWorkUnitId: string;
};

type UpdateEquipmentFlows = Partial<CreateEquipmentFlows>;

type EquipmentFlowsFilter = {
  q?: string;
};

export type { EquipmentFlows, CreateEquipmentFlows, UpdateEquipmentFlows, EquipmentFlowsFilter };
