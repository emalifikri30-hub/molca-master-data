import { ulid } from "ulidx";

import { refusal } from "../../../shared/errors/refusal.js";
import { dateRange, instanceWindow } from "./shift-instances.js";

import { asActor } from "../../../shared/audit/audit-context.js";
import { noTransaction } from "../../../shared/database/transaction.js";
import type { AuditActor } from "../../../shared/audit/audit-context.js";
import type { SitesStore } from "../sites/sites-store.js";
import type { EnterpriseShift, GenerateResult, ShiftInstance, SiteShift } from "./shifts.js";
import type { ShiftsStore } from "./shifts-store.js";
import type { Transact } from "../../../shared/database/transaction.js";

const MINUTES_PER_DAY = 24 * 60;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Half-open, `[valid_from, valid_to)` (F-00, PO 2026-10-02): a row closed today is no longer in force today. */
function isActive(row: { validFrom: string; validTo: string | null }, date = today()): boolean {
  return row.validFrom <= date && (row.validTo === null || row.validTo > date);
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** A shift's minutes on a 0–1440 line; crossing midnight splits it in two. */
function segments(startTime: string, endTime: string): Array<[number, number]> {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (end === start) return [];
  if (end > start) return [[start, end]];
  return [
    [start, MINUTES_PER_DAY],
    [0, end],
  ];
}

function segmentsOverlap(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  return a.some(([as, ae]) => b.some(([bs, be]) => as < be && bs < ae));
}

/** The generator's own identity: it writes as a job, not a person (AUD-001 AC-6). */
/** The generator is a system job (F-14 `source = system`): its rows are audited as the job. */
const GENERATOR: AuditActor = {
  type: "service",
  subjectId: "svc-shift-instance-generator",
  displayName: "Shift instance generator",
  source: "system",
};

type TShiftsService = {
  listEnterprise: (enterpriseId?: string) => Promise<EnterpriseShift[]>;
  createEnterprise: (enterpriseId: string, label: string) => Promise<EnterpriseShift>;
  updateEnterprise: (id: string, label: string) => Promise<EnterpriseShift>;
  retireEnterprise: (id: string) => Promise<EnterpriseShift>;
  listSite: () => Promise<SiteShift[]>;
  declareSite: (input: Omit<SiteShift, "id" | "validFrom" | "validTo">) => Promise<SiteShift>;
  listInstances: (siteId?: string) => Promise<ShiftInstance[]>;
  generate: (siteId: string, from: string, to: string) => Promise<GenerateResult>;
};

type ShiftsServiceDeps = {
  shiftsStore: ShiftsStore;
  sitesStore: SitesStore;
  transact?: Transact;
};

class ShiftsService implements TShiftsService {
  private store: ShiftsStore;
  private sites: SitesStore;
  private transact: Transact;

  constructor({ shiftsStore, sitesStore, transact = noTransaction }: ShiftsServiceDeps) {
    this.store = shiftsStore;
    this.sites = sitesStore;
    this.transact = transact;
    // The job runs by itself every day (SHF-002 rule 1). Seed: this month
    // and the next 30 days at the seeded site, so the calendar opens on data.
    // Postgres already holds the rows, so the in-memory seed runs only without a db.
    if (!this.store.persisted && this.store.instances.length === 0) {
      void this.generate(
        "site-1",
        `${today().slice(0, 8)}01`,
        new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      );
    }
  }

  /** UX-SIT-6 (PO, 2026-10-19): one enterprise's shifts when `enterpriseId` is given. */
  async listEnterprise(enterpriseId?: string): Promise<EnterpriseShift[]> {
    return (await this.store.listEnterprise()).filter(
      (s) => isActive(s) && (!enterpriseId || s.enterpriseId === enterpriseId),
    );
  }

  async createEnterprise(enterpriseId: string, label: string): Promise<EnterpriseShift> {
    const row = { id: ulid(), enterpriseId, label, validFrom: today(), validTo: null };
    return this.store.insertEnterprise(row);
  }

  // SHF-001 rule 4: the label is edited in place.
  async updateEnterprise(id: string, label: string): Promise<EnterpriseShift> {
    const row = (await this.store.listEnterprise()).find((s) => s.id === id);
    if (!row) throw refusal(404, "not_found");
    const updated = await this.store.updateEnterprise(id, { label });
    if (!updated) throw refusal(404, "not_found");
    return updated;
  }

  // Rule 4: refused while any site has hours for it, naming those sites.
  async retireEnterprise(id: string): Promise<EnterpriseShift> {
    const row = (await this.store.listEnterprise()).find((s) => s.id === id);
    if (!row) throw refusal(404, "not_found");
    const siteIds = [
      ...new Set(
        (await this.listSite()).filter((s) => s.enterpriseShiftId === id).map((s) => s.siteId),
      ),
    ];
    if (siteIds.length > 0) throw refusal(409, "delete_blocked", { siteIds });
    const updated = await this.store.updateEnterprise(id, { validTo: today() });
    if (!updated) throw refusal(404, "not_found");
    return updated;
  }

  async listSite(): Promise<SiteShift[]> {
    return (await this.store.listSite()).filter((s) => isActive(s));
  }

  /** Rule 5: new hours close the old row and open a new one. Rule 2: no overlap. */
  async declareSite(input: Omit<SiteShift, "id" | "validFrom" | "validTo">): Promise<SiteShift> {
    // UX-SIT-6 (PO, 2026-10-19): a site reads its own enterprise's shifts only.
    const site = await this.sites.get(input.siteId);
    const shift = (await this.listEnterprise()).find((s) => s.id === input.enterpriseShiftId);
    if (!shift) throw refusal(404, "not_found");
    if (site && site.enterpriseId !== shift.enterpriseId) {
      throw refusal(422, "other_enterprise", { enterpriseId: shift.enterpriseId });
    }
    const active = await this.listSite();
    const existing = active.find(
      (s) => s.siteId === input.siteId && s.enterpriseShiftId === input.enterpriseShiftId,
    );
    // Edge case / AC-11 (H-10, PO 2026-10-02): start = end is neither a
    // zero-length nor a 24-hour shift — refused (`sit-002.shift-site.error.same-time`).
    if (toMinutes(input.startTime) === toMinutes(input.endTime)) throw refusal(422, "same_time");
    // Rule 2 / AC-10 (H-9): `end_time` is the exclusive boundary instant, so
    // shifts that touch (07:00–15:00, 15:00–23:00) share no minute.
    const mine = segments(input.startTime, input.endTime);
    const conflict = active.find(
      (s) =>
        s.siteId === input.siteId &&
        s.id !== existing?.id &&
        segmentsOverlap(mine, segments(s.startTime, s.endTime)),
    );
    if (conflict) throw refusal(409, "overlap", { enterpriseShiftId: conflict.enterpriseShiftId });
    // Half-open: the old hours end today, the new ones start today.
    if (existing) await this.store.updateSite(existing.id, { validTo: today() });
    const row = { id: ulid(), ...input, validFrom: today(), validTo: null };
    return this.store.insertSite(row);
  }

  listInstances(siteId?: string): Promise<ShiftInstance[]> {
    return this.store.listInstances(siteId);
  }

  /**
   * SHF-002: one real shift per date per active site shift.
   * Idempotent (rule 6), closed shifts never regenerated (AC-5), a failure
   * stops on that date and keeps earlier ones (AC-6). Each row is audited
   * as the generator (`asActor`).
   */
  async generate(siteId: string, from: string, to: string): Promise<GenerateResult> {
    const site = await this.sites.get(siteId);
    const timeZone = site?.timezone ?? "Asia/Jakarta";
    const hours = (await this.listSite()).filter((s) => s.siteId === siteId);
    // SHF-002 rule 8 / AC-8: no active SITE_SHIFT rows → nothing to generate.
    // Refused, never a 0-created "success" (the calendar links to the Shift panel).
    if (hours.length === 0) throw refusal(422, "no_shift_hours", { siteId });
    let created = 0;
    let duplicates = 0;
    let failedOn: string | null = null;
    for (const date of dateRange(from, to)) {
      let createdOnDate = 0;
      let duplicatesOnDate = 0;
      try {
        // AC-6: a failed date rolls back alone (savepoint); earlier dates stay.
        // Each row is audited as the generator, by the request's audit middleware.
        await asActor(GENERATOR, () =>
          this.transact(
            async () => {
              for (const siteShift of hours) {
                const existing = await this.store.listInstances(siteId);
                // An hours change opens a new SITE_SHIFT row with a new id; the
                // shift already generated under the old row still holds this date.
                const taken = existing.some(
                  (i) =>
                    i.enterpriseShiftId === siteShift.enterpriseShiftId && i.businessDate === date,
                );
                if (taken) {
                  duplicatesOnDate += 1;
                  continue;
                }
                const window = instanceWindow(
                  date,
                  siteShift.startTime,
                  siteShift.endTime,
                  timeZone,
                );
                const row: ShiftInstance = {
                  // (site shift, date) is unique (rule 6), so the id is too — and it
                  // survives an API restart that regenerates the in-memory calendar.
                  id: `si-${siteShift.id}-${date}`,
                  siteShiftId: siteShift.id,
                  siteId,
                  enterpriseShiftId: siteShift.enterpriseShiftId,
                  businessDate: date,
                  ...window,
                  status: "open",
                };
                await this.store.insertInstance(row);
                createdOnDate += 1;
              }
            },
            { savepoint: true },
          ),
        );
        created += createdOnDate;
        duplicates += duplicatesOnDate;
      } catch {
        failedOn = date;
        break;
      }
    }
    const horizon = (await this.listInstances(siteId)).reduce<string | null>(
      (max, i) => (max === null || i.businessDate > max ? i.businessDate : max),
      null,
    );
    return { created, duplicates, failedOn, horizon };
  }
}

export { ShiftsService };
export type { TShiftsService, ShiftsServiceDeps };
