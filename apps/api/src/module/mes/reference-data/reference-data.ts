// FOUNDATION F-05 Reference & Master Data (PRD-003 05-reference-master-data.md):
// units of measure, measurement groups, time conversions, downtime and
// reject reasons, and which reasons each machine can have (REF-003).

import type {
  DOWNTIME_CATEGORY_VALUES,
  REASON_KIND_VALUES,
} from "../../../shared/database/schema/value-lists.js";
/** Group codes are rows (F-05 §9.4), so any string; seeds in measurement-groups.ts. */
type MeasurementGroupCode = string;
type MeasurementGroup = {
  id: string;
  code: MeasurementGroupCode;
  name: string;
  /** F-05 §9.4: a group ends rather than being deleted (REF-004 rule 5). */
  validFrom?: string | null;
  validTo?: string | null;
};
type UnitOfMeasurement = {
  id: string;
  code: string;
  name: string;
  unit: string;
  measurementGroupId: string;
  deletedAt?: string | null;
};
type TimeConversion = {
  id: string;
  code: string;
  name: string;
  secondsPerUnit: number;
  deletedAt?: string | null;
};
type DowntimeCategory = (typeof DOWNTIME_CATEGORY_VALUES)[number];
type DowntimeReason = {
  id: string;
  code: string;
  name: string;
  downtimeCategory: DowntimeCategory;
  deletedAt?: string | null;
};
type RejectReason = { id: string; code: string; name: string; deletedAt?: string | null };
type ReasonKind = (typeof REASON_KIND_VALUES)[number];
type ReasonTick = {
  id: string;
  kind: ReasonKind;
  reasonId: string;
  assetId: string;
  deletedAt: string | null;
};
// REF-006 rule 2: each blocker is named (the open stop, once B5 exists).
type ReasonImpact = { references: number; ticks: number; blockers: Array<{ label: string }> };

export type {
  MeasurementGroupCode,
  MeasurementGroup,
  UnitOfMeasurement,
  TimeConversion,
  DowntimeCategory,
  DowntimeReason,
  RejectReason,
  ReasonKind,
  ReasonTick,
  ReasonImpact,
};
