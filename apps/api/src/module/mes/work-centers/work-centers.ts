import type { WORK_CENTER_TYPE_VALUES } from "../../../shared/database/schema/value-lists.js";

/** F-01 §9.5 — exactly four work-center types (PRD-003 SIT-001 rule 4). */
type WorkCenterType = (typeof WORK_CENTER_TYPE_VALUES)[number];

type WorkCenters = {
  id: string;
  /** F-01 §9: the date the record starts to apply (set on create). */
  validFrom?: string | null;
  /** PRD-003 SIT-004: optional class of this level (SITE_CLASS … WORK_UNIT_CLASS). "" = none. */
  classId?: string;
  /** PRD-003 SIT-002: set by deactivation, never a hard delete. null/absent = active. */
  validTo?: string | null;
  code: string;
  name: string;
  areaId: string;
  type: WorkCenterType;
};

type CreateWorkCenters = {
  /** PRD-003 SIT-004: optional class of this level (SITE_CLASS … WORK_UNIT_CLASS). "" = none. */
  classId?: string;
  code: string;
  name: string;
  areaId: string;
  type: WorkCenterType;
};

type UpdateWorkCenters = Partial<CreateWorkCenters> & { validTo?: string | null };

type WorkCentersFilter = {
  q?: string;
};

export type {
  WorkCenterType,
  WorkCenters,
  CreateWorkCenters,
  UpdateWorkCenters,
  WorkCentersFilter,
};
