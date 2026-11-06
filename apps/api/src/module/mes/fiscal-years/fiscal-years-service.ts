import { ulid } from "ulidx";

import { refusal } from "../../../shared/errors/refusal.js";
import { addDays, monthlyQuarter, resolveBusinessDate, weeklyQuarter } from "./fiscal-quarters.js";

import type { SitesStore } from "../sites/sites-store.js";
import type { TShiftsService } from "../shifts/shifts-service.js";
import type {
  AmendFiscalYear,
  AmendImpact,
  DeclareFiscalYear,
  FiscalYear,
} from "./fiscal-years.js";
import type { FiscalYearsStore } from "./fiscal-years-store.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function overlaps(a: { startDate: string; endDate: string }, b: FiscalYear): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

type QuarterRow = Pick<
  FiscalYear,
  "calendarBasis" | "startMonth" | "startDate" | "endDate" | "label"
>;

function quarterOf(fy: QuarterRow, date: string): string | null {
  if (date < fy.startDate || date > fy.endDate) return null;
  const q =
    fy.calendarBasis === "monthly"
      ? monthlyQuarter(Number(date.slice(5, 7)), fy.startMonth ?? 1)
      : weeklyQuarter(date, fy.startDate);
  return `${fy.label}·Q${q}`;
}

/**
 * FYR-002 §4: compare old and new labels on every production date; count the
 * closed real shifts that would move. Reads SHIFT_INSTANCE from the shifts module.
 */
function amendImpact(
  old: FiscalYear,
  next: DeclareFiscalYear,
  productionDates: ReadonlyArray<string>,
  closedDates: ReadonlyArray<string>,
): AmendImpact {
  const nextRow = { ...next, label: next.label.trim() };
  const moved = productionDates.filter((d) => quarterOf(old, d) !== quarterOf(nextRow, d));
  const closedSet = new Set(closedDates);
  const closedMoved = [...new Set(moved.filter((d) => closedSet.has(d)))].sort();
  return {
    closedPeriods: closedMoved.length,
    closedRange:
      closedMoved.length > 0
        ? { startDate: closedMoved[0], endDate: closedMoved[closedMoved.length - 1] }
        : null,
    movedDates: new Set(moved).size,
  };
}

type TFiscalYearsService = {
  current: (enterpriseId?: string) => Promise<FiscalYear[]>;
  versions: (enterpriseId?: string) => Promise<FiscalYear[]>;
  declare: (input: DeclareFiscalYear) => Promise<FiscalYear>;
  impact: (id: string, input: DeclareFiscalYear) => Promise<AmendImpact>;
  amend: (id: string, input: AmendFiscalYear) => Promise<FiscalYear>;
  resolve: (
    businessDate: string,
    enterpriseId?: string,
  ) => Promise<ReturnType<typeof resolveBusinessDate>>;
};

type FiscalYearsServiceDeps = {
  fiscalYearsStore: FiscalYearsStore;
  shiftsService: TShiftsService;
  sitesStore: SitesStore;
};

/**
 * UX-SIT-6 (PO, 2026-10-19): each enterprise declares its own fiscal years and
 * a site reads its own enterprise's. Labels, overlaps and gaps are checked
 * within one enterprise. Without `enterpriseId`, reads span every enterprise.
 */
const ofEnterprise = (rows: FiscalYear[], enterpriseId?: string) =>
  enterpriseId ? rows.filter((fy) => fy.enterpriseId === enterpriseId) : rows;

class FiscalYearsService implements TFiscalYearsService {
  private store: FiscalYearsStore;
  private shifts: TShiftsService;
  private sites: SitesStore;

  constructor({ fiscalYearsStore, shiftsService, sitesStore }: FiscalYearsServiceDeps) {
    this.store = fiscalYearsStore;
    this.shifts = shiftsService;
    this.sites = sitesStore;
  }

  async current(enterpriseId?: string): Promise<FiscalYear[]> {
    return ofEnterprise(await this.store.list(), enterpriseId)
      .filter((fy) => fy.validTo === null)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  async versions(enterpriseId?: string): Promise<FiscalYear[]> {
    return [...ofEnterprise(await this.store.list(), enterpriseId)].sort((a, b) =>
      b.startDate.localeCompare(a.startDate),
    );
  }

  /** FYR-001 rules 5 and 6: unique label, no overlap. */
  async declare(input: DeclareFiscalYear): Promise<FiscalYear> {
    const label = input.label.trim();
    const current = await this.current(input.enterpriseId);
    const same = current.find((fy) => fy.label === label);
    if (same) throw refusal(409, "label_taken", { existing: same });
    const conflict = current.find((fy) => overlaps(input, fy));
    if (conflict) throw refusal(409, "overlap", { conflicting: conflict });
    const id = ulid();
    const row: FiscalYear = {
      ...input,
      label,
      id,
      validFrom: input.startDate,
      validTo: null,
      lineageId: id,
      previousVersionId: null,
    };
    return this.store.insert(row);
  }

  async impact(id: string, input: DeclareFiscalYear): Promise<AmendImpact> {
    const old = (await this.store.list()).find((fy) => fy.id === id);
    if (!old) throw refusal(404, "not_found");
    // Only the shifts of this enterprise's sites read this year.
    const siteIds = new Set(
      (await this.sites.all()).filter((s) => s.enterpriseId === old.enterpriseId).map((s) => s.id),
    );
    const instances = (await this.shifts.listInstances()).filter((i) => siteIds.has(i.siteId));
    const productionDates = [...new Set(instances.map((i) => i.businessDate))];
    const closedDates = instances.filter((i) => i.status === "closed").map((i) => i.businessDate);
    return amendImpact(old, input, productionDates, closedDates);
  }

  /** FYR-002: never in place — the old version ends the day before; rules 2–5. */
  async amend(id: string, input: AmendFiscalYear): Promise<FiscalYear> {
    const old = (await this.store.list()).find((fy) => fy.id === id);
    if (!old || old.validTo !== null) throw refusal(404, "not_found");
    const others = (await this.current(old.enterpriseId)).filter((fy) => fy.id !== id);
    const label = input.label.trim();
    const same = others.find((fy) => fy.label === label);
    if (same) throw refusal(409, "label_taken", { existing: same });
    if (input.effectiveDate < today())
      throw refusal(422, "amend", { refusal: { kind: "past_date" } });
    if (input.calendarBasis !== old.calendarBasis)
      throw refusal(422, "amend", { refusal: { kind: "mode_change" } });
    const impact = await this.impact(id, input);
    if (impact.closedPeriods > 0 && impact.closedRange) {
      throw refusal(422, "amend", {
        refusal: { kind: "closed_period", count: impact.closedPeriods, ...impact.closedRange },
      });
    }
    const conflict = others.find((fy) => overlaps(input, fy));
    if (conflict)
      throw refusal(422, "amend", { refusal: { kind: "overlap", conflicting: conflict } });
    const nextYear = others
      .filter((fy) => fy.startDate > old.endDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    if (
      nextYear &&
      addDays(input.endDate, 1) < nextYear.startDate &&
      old.endDate >= addDays(nextYear.startDate, -1)
    ) {
      throw refusal(422, "amend", {
        refusal: {
          kind: "gap",
          startDate: addDays(input.endDate, 1),
          endDate: addDays(nextYear.startDate, -1),
        },
      });
    }
    const prevYear = others
      .filter((fy) => fy.endDate < old.startDate)
      .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
    if (
      prevYear &&
      input.startDate > addDays(prevYear.endDate, 1) &&
      old.startDate <= addDays(prevYear.endDate, 1)
    ) {
      throw refusal(422, "amend", {
        refusal: {
          kind: "gap",
          startDate: addDays(prevYear.endDate, 1),
          endDate: addDays(input.startDate, -1),
        },
      });
    }
    const { effectiveDate, ...fields } = input;
    // Half-open (PO 2026-10-02): the old version ends on the effective date,
    // the day the new one starts — on that date only the new one is in force.
    // A version superseded before it started closes at its own validFrom: an
    // empty [validFrom, validFrom) range, never in force (FYR-002).
    const validTo = effectiveDate > old.validFrom ? effectiveDate : old.validFrom;
    const closed = await this.store.update(old.id, { validTo });
    if (!closed) throw refusal(404, "not_found");
    const next: FiscalYear = {
      ...fields,
      // A new version stays with its enterprise.
      enterpriseId: old.enterpriseId,
      label,
      id: ulid(),
      validFrom: effectiveDate,
      validTo: null,
      lineageId: closed.lineageId,
      previousVersionId: closed.id,
    };
    return this.store.insert(next);
  }

  /** FYR-003: resolve a business date against every version. */
  async resolve(businessDate: string, enterpriseId?: string) {
    return resolveBusinessDate(businessDate, ofEnterprise(await this.store.list(), enterpriseId));
  }
}

export { FiscalYearsService, amendImpact };
export type { TFiscalYearsService, FiscalYearsServiceDeps };
