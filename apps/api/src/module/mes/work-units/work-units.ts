type WorkUnits = {
  id: string;
  /** F-01 §9: the date the record starts to apply (set on create). */
  validFrom?: string | null;
  /** PRD-003 SIT-004: optional class of this level (SITE_CLASS … WORK_UNIT_CLASS). "" = none. */
  classId?: string;
  /** PRD-003 SIT-002: set by deactivation, never a hard delete. null/absent = active. */
  validTo?: string | null;
  code: string;
  name: string;
  workCenterId: string;
};

type CreateWorkUnits = {
  /** PRD-003 SIT-004: optional class of this level (SITE_CLASS … WORK_UNIT_CLASS). "" = none. */
  classId?: string;
  code: string;
  name: string;
  workCenterId: string;
};

type UpdateWorkUnits = Partial<CreateWorkUnits> & { validTo?: string | null };

type WorkUnitsFilter = {
  q?: string;
};

export type { WorkUnits, CreateWorkUnits, UpdateWorkUnits, WorkUnitsFilter };
