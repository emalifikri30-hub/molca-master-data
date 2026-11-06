// FOUNDATION F-03 FISCAL_YEAR (PRD-003 03-yearly-quarterly-declaration.md):
// declared once per enterprise; amendments are new versions (FYR-002).

import type {
  CALENDAR_BASIS_VALUES,
  PERIOD_PATTERN_VALUES,
} from "../../../shared/database/schema/value-lists.js";
type CalendarBasis = (typeof CALENDAR_BASIS_VALUES)[number];
type PeriodPattern = (typeof PERIOD_PATTERN_VALUES)[number];
const PERIOD_PATTERNS: PeriodPattern[] = ["4-5-4", "4-4-5", "5-4-4"];

type FiscalYear = {
  id: string;
  /** UX-SIT-6 (PO, 2026-10-19): each enterprise declares its own fiscal years (F-03 §9.1). */
  enterpriseId: string;
  label: string;
  calendarBasis: CalendarBasis;
  /** Monthly mode only. */
  startMonth?: number;
  endMonth?: number;
  /** Weekly mode only. */
  periodPattern?: PeriodPattern;
  startDate: string;
  endDate: string;
  validFrom: string;
  validTo: string | null;
  /** Every version of one fiscal year shares this (the first version's id). */
  lineageId: string;
  previousVersionId: string | null;
};

type DeclareFiscalYear = Omit<
  FiscalYear,
  "id" | "validFrom" | "validTo" | "lineageId" | "previousVersionId"
>;

type AmendFiscalYear = DeclareFiscalYear & { effectiveDate: string };

type AmendImpact = {
  closedPeriods: number;
  closedRange: { startDate: string; endDate: string } | null;
  movedDates: number;
};

export { PERIOD_PATTERNS };
export type {
  CalendarBasis,
  PeriodPattern,
  FiscalYear,
  DeclareFiscalYear,
  AmendFiscalYear,
  AmendImpact,
};
