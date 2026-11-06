// FI-2 line flow: which station feeds which on a line (EQUIPMENT_FLOW).
// One row is one edge, from one work unit to the next, in the line sheet's
// station order: packer → inner (or folding) → cartoner → robot. Several
// stations can feed one (line 8: GP E/F/G/H → Inner; line 6: both foldings →
// Cartoner). Line 7 has a single station, so it has no edge.
// Edges are written by station name and resolved to the seeded work unit ids,
// so a renumbered station still lands on the right row.

import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { SeedStation } from "./seed-fi2-routing.js";
import { equipmentFlowTable } from "./schema/schema.js";

const VALID_FROM = "2026-02-03";

type Edge = { line: string; from: string; to: string };

const EDGES: Edge[] = [
  { line: "FI2-1", from: "Vertical packer line 1", to: "Inner line 1" },
  { line: "FI2-1", from: "Inner line 1", to: "Cartoner line 1" },
  { line: "FI2-2", from: "Vertical packer line 2", to: "Inner line 2" },
  { line: "FI2-2", from: "Inner line 2", to: "Cartoner line 2" },
  { line: "FI2-3", from: "Vertical packer line 3", to: "Inner line 3" },
  { line: "FI2-3", from: "Inner line 3", to: "Cartoner line 3" },
  { line: "FI2-4", from: "Vertical packer line 4", to: "Folding line 4" },
  { line: "FI2-5", from: "Sanko D line 5", to: "Inner line 5" },
  { line: "FI2-5", from: "Inner line 5", to: "Cartoner line 5" },
  { line: "FI2-6", from: "PTCL A line 6", to: "Folding line 6" },
  { line: "FI2-6", from: "PTCL B line 6", to: "Folding PTCL B" },
  { line: "FI2-6", from: "Folding line 6", to: "Cartoner line 6" },
  { line: "FI2-6", from: "Folding PTCL B", to: "Cartoner line 6" },
  { line: "FI2-6", from: "Cartoner line 6", to: "Robot line 6" },
  { line: "FI2-8", from: "GP E line 8", to: "Inner line 8" },
  { line: "FI2-8", from: "GP F line 8", to: "Inner line 8" },
  { line: "FI2-8", from: "GP G line 8", to: "Inner line 8" },
  { line: "FI2-8", from: "GP H line 8", to: "Inner line 8" },
  { line: "FI2-8", from: "Inner line 8", to: "Cartoner line 8" },
  { line: "FI2-8", from: "Cartoner line 8", to: "Robot line 8" },
  { line: "FI2-9", from: "GP K line 9", to: "Robot line 9" },
  { line: "FI2-9", from: "GP I line 9", to: "Robot line 9" },
  { line: "FI2-10", from: "Unilogo A line 10", to: "Inner line 10" },
  { line: "FI2-10", from: "Inner line 10", to: "Cartoner line 10" },
  { line: "FI2-11", from: "GP C / Ajiplus line 11", to: "Cartoner line 11" },
];

export async function seedFi2Flows(
  db: NodePgDatabase,
  region: string,
  tenantId: string,
  stations: SeedStation[],
): Promise<number> {
  const byName = new Map(
    stations.map((station) => [`${station.lineCode}|${station.name}`, station]),
  );
  const station = (line: string, name: string) => {
    const found = byName.get(`${line}|${name}`);
    if (!found) throw new Error(`Flow station not seeded: ${line} ${name}`);
    return found;
  };

  const rows = EDGES.map((edge) => {
    const from = station(edge.line, edge.from);
    const to = station(edge.line, edge.to);
    return {
      id: `ef-${from.id}-${to.id}`,
      region,
      tenantId,
      workCenterId: `wc-${edge.line.toLowerCase()}`,
      fromWorkUnitId: from.id,
      toWorkUnitId: to.id,
      validFrom: VALID_FROM,
    };
  });

  const workCenterIds = [...new Set(rows.map((row) => row.workCenterId))];
  await db
    .delete(equipmentFlowTable)
    .where(
      and(
        eq(equipmentFlowTable.tenantId, tenantId),
        inArray(equipmentFlowTable.workCenterId, workCenterIds),
      ),
    );
  await db.insert(equipmentFlowTable).values(rows);
  console.log(`Seeded line flows: ${rows.length} edges on ${workCenterIds.join(", ")}`);
  return rows.length;
}
