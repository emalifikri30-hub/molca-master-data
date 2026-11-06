// PRD-003 US-FND-SIT-004 — SITE_CLASS, AREA_CLASS, WORK_CENTER_CLASS,
// WORK_UNIT_CLASS (F-01 §9.7–§9.10): four flat lists, code + name only.

type ClassLevel = "site" | "area" | "work-center" | "work-unit";
const CLASS_LEVELS: ClassLevel[] = ["site", "area", "work-center", "work-unit"];

type LocationClass = {
  id: string;
  level: ClassLevel;
  code: string;
  name: string;
  validFrom: string;
  validTo: string | null;
};

export { CLASS_LEVELS };
export type { ClassLevel, LocationClass };
