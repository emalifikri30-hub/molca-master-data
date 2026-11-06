// FOUNDATION F-02 Shift (PRD-003 02-shift.md): ENTERPRISE_SHIFT labels,
// SITE_SHIFT hours (effective-dated), SHIFT_INSTANCE real shifts.

import type { SHIFT_INSTANCE_STATUS_VALUES } from "../../../shared/database/schema/value-lists.js";
type EnterpriseShift = {
  id: string;
  /** UX-SIT-6 (PO, 2026-10-19): each enterprise declares its own shifts (F-02 §9.1). */
  enterpriseId: string;
  label: string;
  validFrom: string;
  validTo: string | null;
  /** Set by the database (`stamps()`); absent on the in-memory seed rows. */
  createdAt?: Date | string;
};

type SiteShift = {
  id: string;
  enterpriseShiftId: string;
  siteId: string;
  startTime: string;
  endTime: string;
  validFrom: string;
  validTo: string | null;
};

type ShiftInstanceStatus = (typeof SHIFT_INSTANCE_STATUS_VALUES)[number];

type ShiftInstance = {
  id: string;
  siteShiftId: string;
  siteId: string;
  enterpriseShiftId: string;
  /** The date the shift starts (F-02 core concept 4). */
  businessDate: string;
  /** UTC ISO timestamps. */
  startDatetime: string;
  endDatetime: string;
  status: ShiftInstanceStatus;
};

type GenerateResult = {
  created: number;
  duplicates: number;
  failedOn: string | null;
  horizon: string | null;
};

export type { EnterpriseShift, SiteShift, ShiftInstance, ShiftInstanceStatus, GenerateResult };
