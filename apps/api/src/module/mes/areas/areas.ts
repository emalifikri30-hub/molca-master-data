type Areas = {
  id: string;
  /** F-01 §9: the date the record starts to apply (set on create). */
  validFrom?: string | null;
  /** PRD-003 SIT-004: optional class of this level (SITE_CLASS … WORK_UNIT_CLASS). "" = none. */
  classId?: string;
  /** PRD-003 SIT-002: set by deactivation, never a hard delete. null/absent = active. */
  validTo?: string | null;
  code: string;
  name: string;
  siteId: string;
};

type CreateAreas = {
  /** PRD-003 SIT-004: optional class of this level (SITE_CLASS … WORK_UNIT_CLASS). "" = none. */
  classId?: string;
  code: string;
  name: string;
  siteId: string;
};

type UpdateAreas = Partial<CreateAreas> & { validTo?: string | null };

type AreasFilter = {
  q?: string;
};

export type { Areas, CreateAreas, UpdateAreas, AreasFilter };
