// Mojokerto shifts (F-02): the three enterprise shifts, the site's hours for
// them, and the real shifts (SHIFT_INSTANCE) those hours make over a date range.
// Existing rows win: an enterprise shift is matched by label and a site's active
// hours are kept, so hours edited in the Site panel are never reset. Instances
// follow the generator's rules (ShiftsService.generate): every date,
// one per site shift and business date, start and end saved in UTC.

import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { dateRange, instanceWindow } from "../../module/mes/shifts/shift-instances.js";
import {
  enterpriseShiftTable,
  shiftInstanceTable,
  siteShiftTable,
  siteTable,
} from "./schema/schema.js";

const VALID_FROM = "2026-02-03";
const TIME_ZONE = "Asia/Jakarta";

const SHIFTS = [
  { n: 1, label: "Shift 1", startTime: "07:00", endTime: "15:00" },
  { n: 2, label: "Shift 2", startTime: "15:00", endTime: "23:00" },
  { n: 3, label: "Shift 3", startTime: "23:00", endTime: "07:00" },
];

export async function seedFi2Shifts(
  db: NodePgDatabase,
  region: string,
  tenantId: string,
  siteId: string,
  from: string,
  to: string,
): Promise<{ hours: number; created: number }> {
  const today = new Date().toISOString().slice(0, 10);
  // UX-SIT-6 (PO, 2026-10-19): the shifts belong to the site's own enterprise.
  const [siteRow] = await db.select().from(siteTable).where(eq(siteTable.id, siteId));
  if (!siteRow) throw new Error(`site ${siteId} not found`);
  const enterpriseId = siteRow.enterpriseId;
  const inForce = (table: typeof enterpriseShiftTable | typeof siteShiftTable) =>
    or(isNull(table.validTo), gt(table.validTo, today));

  const hours: Array<typeof siteShiftTable.$inferSelect> = [];
  let hoursAdded = 0;
  for (const shift of SHIFTS) {
    let [enterprise] = await db
      .select()
      .from(enterpriseShiftTable)
      .where(
        and(
          eq(enterpriseShiftTable.tenantId, tenantId),
          eq(enterpriseShiftTable.enterpriseId, enterpriseId),
          eq(enterpriseShiftTable.label, shift.label),
          inForce(enterpriseShiftTable),
        ),
      );
    if (!enterprise) {
      [enterprise] = await db
        .insert(enterpriseShiftTable)
        .values({
          id: `es-shift-${shift.n}`,
          region,
          tenantId,
          enterpriseId,
          label: shift.label,
          validFrom: VALID_FROM,
        })
        .returning();
    }
    let [site] = await db
      .select()
      .from(siteShiftTable)
      .where(
        and(
          eq(siteShiftTable.tenantId, tenantId),
          eq(siteShiftTable.siteId, siteId),
          eq(siteShiftTable.enterpriseShiftId, enterprise.id),
          inForce(siteShiftTable),
        ),
      );
    if (!site) {
      [site] = await db
        .insert(siteShiftTable)
        .values({
          id: `ss-${siteId}-shift-${shift.n}`,
          region,
          tenantId,
          enterpriseShiftId: enterprise.id,
          siteId,
          startTime: shift.startTime,
          endTime: shift.endTime,
          validFrom: VALID_FROM,
        })
        .returning();
      hoursAdded += 1;
    }
    hours.push(site);
  }

  const rows = dateRange(from, to).flatMap((date) =>
    hours.map((site) => ({
      id: `si-${site.id}-${date}`,
      region,
      tenantId,
      siteShiftId: site.id,
      siteId,
      enterpriseShiftId: site.enterpriseShiftId,
      businessDate: date,
      ...instanceWindow(date, site.startTime, site.endTime, TIME_ZONE),
      status: "open",
    })),
  );
  // A shift already made for that date under older hours keeps its place.
  const taken = new Set(
    (
      await db
        .select({
          shift: shiftInstanceTable.enterpriseShiftId,
          date: shiftInstanceTable.businessDate,
        })
        .from(shiftInstanceTable)
        .where(
          and(eq(shiftInstanceTable.tenantId, tenantId), eq(shiftInstanceTable.siteId, siteId)),
        )
    ).map((row) => `${row.shift}|${row.date}`),
  );
  const fresh = rows.filter((row) => !taken.has(`${row.enterpriseShiftId}|${row.businessDate}`));
  const created = fresh.length
    ? (await db.insert(shiftInstanceTable).values(fresh).onConflictDoNothing().returning()).length
    : 0;
  return { hours: hoursAdded, created };
}
