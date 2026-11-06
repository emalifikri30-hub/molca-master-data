// FI-2 pouch / inner / carton rates, stored as routing steps.
// A routing is one product at one work center (the line). Each rate becomes
// one operation on the station that counts that unit:
//   pouch per minute  → packer station, per piece
//   inner per minute  → inner station, per inner (or the folding station, per calendar)
//   carton per minute → cartoner station, per carton
// The sheet gives a count per minute. The operation stores the time for one
// item: cycle_time_value = 1 / rate, in minutes, batch size 1.
// "240 per minute" → 0.004167 minutes per piece. Seconds are applied later
// from TIME_CONVERSIONS (minute = 60). A blank or TBC rate is left out.
// A shared station whose rows disagree (line 8 inner and carton) takes the fastest
// conversion among its rows, so it keeps up with its fastest feeder.

import { and, eq, inArray, like } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { assetKey } from "./seed-fi2-nodes.js";
import { productId, skuMid } from "./seed-fi2-products.js";
import {
  operationTable,
  productFlowTable,
  routingTable,
  timeConversionTable,
} from "./schema/schema.js";

const VALID_FROM = "2026-02-03";
const MINUTE = "tc-min";
const PCS = "uom-pcs";
const INNER = "uom-inner";
const CAL = "uom-cal";
const CTN = "uom-ctn";

export type SeedStation = {
  id: string;
  code: string;
  name: string;
  lineCode: string;
  kind: "packer" | "inner" | "cartoner" | "folding" | "robot";
  assets: string[];
};

/**
 * The pack a station's counters count, the same unit its routing steps use:
 * the packer counts pouches (pcs), the inner station inners, the folding
 * station calendars, the cartoner cartons. A robot station has no step, so
 * no unit is assumed for it.
 */
export const STATION_COUNT_UOM: Record<SeedStation["kind"], string> = {
  packer: PCS,
  inner: INNER,
  folding: CAL,
  cartoner: CTN,
  robot: "",
};

type Rate = {
  product: string;
  line: string;
  /** Set when this row's pouch rate belongs to one packer. */
  asset?: string;
  pouch?: number;
  inner?: number;
  carton?: number;
};

const RATES: Rate[] = [
  { product: "A5RB 90 GR", line: "FI2-1", pouch: 240, inner: 20, carton: 2 },
  { product: "A5RB 90 GR", line: "FI2-2", pouch: 240, inner: 20, carton: 2 },
  { product: "A5RB 90 GR", line: "FI2-3", pouch: 240, inner: 20, carton: 2 },
  { product: "MJCL 7.5 GR", line: "FI2-4", pouch: 720, inner: 30, carton: 2 },
  { product: "50 GR", line: "FI2-5", pouch: 375, inner: 18.8, carton: 2 },
  { product: "RC 50GR", line: "FI2-5", pouch: 375, inner: 18.8, carton: 2 },
  { product: "PTCL 16 GR", line: "FI2-6", pouch: 680, inner: 34, carton: 2 },
  { product: "250 GR-RC", line: "FI2-7", pouch: 65 },
  { product: "250 GR-RC", line: "FI2-8", asset: "OMRONG-1", pouch: 60, inner: 6, carton: 1 },
  { product: "250 GR-RC", line: "FI2-8", asset: "OMRONM-1", pouch: 65, inner: 6.5, carton: 0.81 },
  { product: "250 GR-RC", line: "FI2-8", asset: "OMRONM-2", pouch: 55, inner: 5.5, carton: 1 },
  { product: "250 GR-RC", line: "FI2-8", asset: "OMRONM-3", pouch: 65, inner: 6.5, carton: 1 },
  { product: "250 GR-RC", line: "FI2-9", pouch: 65, inner: 6.5, carton: 1 },
  { product: "250 GR-LC", line: "FI2-9", pouch: 60, carton: 1 },
  { product: "500 GR-LC", line: "FI2-9", pouch: 60, carton: 3 },
  { product: "KGRC", line: "FI2-9", pouch: 50, carton: 3 },
  { product: "KGLC", line: "FI2-9", pouch: 50, carton: 4 },
  { product: "AP 120 GR", line: "FI2-9", pouch: 60, inner: 5, carton: 1 },
  { product: "250 GR-RC EXP", line: "FI2-9", pouch: 65, carton: 1 },
  { product: "KGLC EXP", line: "FI2-9", pouch: 50, carton: 4 },
  { product: "KGRC EXP", line: "FI2-9", pouch: 50, carton: 3 },
  { product: "100 GR", line: "FI2-10", pouch: 200, inner: 20, carton: 2 },
  { product: "100 GR 12-LC EXP", line: "FI2-10", pouch: 200, inner: 20, carton: 2 },
  { product: "100 GR 12-RC EXP", line: "FI2-10", pouch: 200, inner: 20, carton: 3 },
  { product: "100 GR 18-LC EXP", line: "FI2-10", pouch: 200, inner: 20, carton: 1 },
  { product: "100 GR 18-RC EXP", line: "FI2-10", pouch: 200, inner: 6.7 },
  { product: "100 GR 18-RC EGYPT EXP", line: "FI2-10", pouch: 200, inner: 20, carton: 1 },
  { product: "AJPKG", line: "FI2-11", pouch: 25, carton: 1 },
  { product: "AJP 200 GR", line: "FI2-11", pouch: 60, inner: 12, carton: 2 },
  { product: "APKG", line: "FI2-11", pouch: 25, carton: 1 },
  { product: "KGAE", line: "FI2-11", pouch: 25, carton: 1 },
  { product: "250 GR-RC", line: "FI2-11", pouch: 65, inner: 6.5, carton: 1 },
  { product: "APKG EXP", line: "FI2-11", pouch: 25, carton: 1 },
];

/** Half-up to 6 decimal places (F-08 cycle time, same limit as a conversion factor). */
function round6(n: number): number {
  return (Math.sign(n) * Math.round(Math.abs(n) * 1e6 + 1e-9)) / 1e6;
}

function minutesPerItem(perMinute: number): number {
  return round6(1 / perMinute);
}

/**
 * The rate of a station shared by several machines. The sheet converts each machine's speed to the
 * shared unit (line 8: 60/65/55/65 pouches give 6/6.5/5.5/6.5 inners), so the rows disagree. A shared
 * station must keep up with its fastest feeder, so take the fastest conversion — which also matches
 * the same product's rate on other lines (250 GR-RC runs at 6.5 inner and 1 carton per minute).
 */
function fastest(values: number[]): number {
  return Math.max(...values);
}

type Step = {
  station: SeedStation;
  perMinute: number;
  uomId: string;
  stepType: string;
};

function stepsFor(
  product: string,
  line: string,
  stations: SeedStation[],
  skipped: string[],
): Step[] {
  const rows = RATES.filter((rate) => rate.product === product && rate.line === line);
  const onLine = stations.filter((station) => station.lineCode === line);
  const steps: Step[] = [];
  const mid = skuMid(product);

  for (const station of onLine.filter((station) => station.kind === "packer")) {
    const specific = rows.find(
      (rate) =>
        rate.asset && station.assets.some((tag) => assetKey(tag) === assetKey(rate.asset ?? "")),
    );
    const pouch = specific?.pouch ?? rows.find((rate) => !rate.asset)?.pouch;
    if (pouch && pouch > 0) {
      steps.push({ station, perMinute: pouch, uomId: PCS, stepType: "Pouch" });
    }
  }

  const innerStations = onLine.filter(
    (station) => station.kind === "inner" || station.kind === "folding",
  );
  const inners = rows.flatMap((rate) => (rate.inner && rate.inner > 0 ? [rate.inner] : []));
  if (innerStations.length && inners.length) {
    if (!mid) {
      skipped.push(`${product} ${line}: inner rate has no inner or calendar conversion`);
    } else {
      for (const station of innerStations) {
        steps.push({
          station,
          perMinute: fastest(inners),
          uomId: mid === "calendar" ? CAL : INNER,
          stepType: mid === "calendar" ? "Calendar" : "Inner",
        });
      }
    }
  } else if (inners.length && innerStations.length === 0) {
    skipped.push(`${product} ${line}: inner ${inners[0]} / min has no inner station`);
  }

  const cartonStations = onLine.filter((station) => station.kind === "cartoner");
  const cartons = rows.flatMap((rate) => (rate.carton && rate.carton > 0 ? [rate.carton] : []));
  if (cartonStations.length && cartons.length) {
    for (const station of cartonStations) {
      steps.push({ station, perMinute: fastest(cartons), uomId: CTN, stepType: "Carton" });
    }
  } else if (cartons.length && cartonStations.length === 0) {
    skipped.push(`${product} ${line}: carton ${cartons[0]} / min has no cartoner station`);
  }

  return steps;
}

export async function seedFi2Routing(
  db: NodePgDatabase,
  region: string,
  tenantId: string,
  stations: SeedStation[],
): Promise<void> {
  await db
    .delete(operationTable)
    .where(and(eq(operationTable.tenantId, tenantId), like(operationTable.routingId, "rt-prd-%")));
  await db
    .delete(routingTable)
    .where(and(eq(routingTable.tenantId, tenantId), like(routingTable.id, "rt-prd-%")));
  await db
    .delete(productFlowTable)
    .where(and(eq(productFlowTable.tenantId, tenantId), like(productFlowTable.id, "flow-prd-%")));
  await db
    .delete(timeConversionTable)
    .where(
      and(
        eq(timeConversionTable.tenantId, tenantId),
        inArray(timeConversionTable.id, ["tc-sec", MINUTE, "tc-hour", "tc-day"]),
      ),
    );

  await db.insert(timeConversionTable).values([
    { id: "tc-sec", region, tenantId, code: "SEC", name: "Second", secondsPerUnit: 1 },
    { id: MINUTE, region, tenantId, code: "MIN", name: "Minute", secondsPerUnit: 60 },
    { id: "tc-hour", region, tenantId, code: "HOUR", name: "Hour", secondsPerUnit: 3600 },
    { id: "tc-day", region, tenantId, code: "DAY", name: "Day", secondsPerUnit: 86400 },
  ]);

  const pairs = [...new Set(RATES.map((rate) => `${rate.product}\t${rate.line}`))];
  const skipped: string[] = [];
  const flows = new Map<string, string>();
  const routings: Array<typeof routingTable.$inferInsert> = [];
  const operations: Array<typeof operationTable.$inferInsert> = [];

  for (const pair of pairs) {
    const [product, line] = pair.split("\t");
    if (!product || !line) continue;
    const steps = stepsFor(product, line, stations, skipped);
    if (!steps.length) {
      skipped.push(`${product} ${line}: no station to put a rate on`);
      continue;
    }
    const pid = productId(product);
    let flowId = flows.get(pid);
    if (!flowId) {
      flowId = `flow-${pid}`;
      flows.set(pid, flowId);
    }
    const routingId = `rt-${pid}-${line.toLowerCase()}`;
    routings.push({
      id: routingId,
      region,
      tenantId,
      productId: pid,
      workCenterId: `wc-${line.toLowerCase()}`,
      flowId,
      version: 1,
      status: "released",
      isPrimary: true,
      enforceSequence: true,
      validFrom: VALID_FROM,
    });
    steps.forEach((step, index) => {
      const id = `op-${routingId}-${step.station.code.toLowerCase()}`;
      operations.push({
        id,
        region,
        tenantId,
        stepId: id,
        routingId,
        stepNumber: (index + 1) * 10,
        stepName: step.station.name,
        stepType: step.stepType,
        workUnitId: step.station.id,
        cycleTimeValue: minutesPerItem(step.perMinute),
        uomId: step.uomId,
        timeConversionId: MINUTE,
        batchSize: 1,
        validFrom: VALID_FROM,
      });
    });
  }

  if (flows.size) {
    await db.insert(productFlowTable).values(
      [...flows.entries()].map(([pid, id]) => ({
        id,
        region,
        tenantId,
        productId: pid,
        flowCode: "STANDARD",
        flowName: "Standard",
        isPrimary: true,
        status: "released" as const,
        validFrom: VALID_FROM,
      })),
    );
  }
  if (routings.length) await db.insert(routingTable).values(routings);
  if (operations.length) await db.insert(operationTable).values(operations);

  console.log(
    `Seeded 4 time conversions, ${flows.size} flows, ${routings.length} routings, ${operations.length} operations. Skipped ${skipped.length} rates.`,
  );
  for (const line of skipped) console.log(`  skip: ${line}`);
}
