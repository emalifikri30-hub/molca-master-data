type Sites = {
  id: string;
  /** F-01 §9: the date the record starts to apply (set on create). */
  validFrom?: string | null;
  /** null = active. Deactivation sets it; never hard-deleted. */
  validTo?: string | null;
  /** PRD-003 SIT-004: optional class of this level (SITE_CLASS … WORK_UNIT_CLASS). "" = none. */
  classId?: string;
  /** FK -> ENTERPRISE (F-01 §9.2/§9.3) — required, every Site belongs to one Enterprise. */
  enterpriseId: string;
  code: string;
  name: string;
  /** IANA timezone (e.g. "Asia/Jakarta") — F-01 §9.3. Shift boundaries and
   * business_date are derived against this per site. */
  timezone: string;
};

type CreateSites = {
  /** PRD-003 SIT-004: optional class of this level (SITE_CLASS … WORK_UNIT_CLASS). "" = none. */
  classId?: string;
  enterpriseId: string;
  code: string;
  name: string;
  timezone: string;
};

type UpdateSites = Partial<CreateSites> & { validTo?: string | null };

type SitesFilter = {
  q?: string;
};

export type { Sites, CreateSites, UpdateSites, SitesFilter };
