// Mojokerto / FI-2 line and machine list (sheet dated 2026-02-03).
// OEE codes from that sheet are not stored. HW Code is ASSET.asset_tag.
// A row with no HW code gets a generated tag NOHW-<line>-<nn>.
// Repeated sheet value "TBC" is suffixed so asset tags stay unique.
// A work unit is a station on the line (vertical packer, inner, cartoner, …).
// The machines on that station, including its checkweighers, are assets.
// Rejector rows stay in the sheet so NOHW numbering holds, but are not loaded: they carry no tags.

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, inArray, isNull, like, or } from "drizzle-orm";
import { Pool } from "pg";

import { runInTenant } from "../tenant/tenant-context.js";
import { createPostgresDb, type PostgresDB } from "./postgres.js";
import { ensureTenant, seedTenantFromEnv, type SeedTenant } from "./seed-tenant.js";
import { seedFi2Flows } from "./seed-fi2-flows.js";
import { seedFi2Reasons } from "./seed-fi2-reasons.js";
import { seedFi2Kpi } from "./seed-fi2-kpi.js";
import { seedFi2Products } from "./seed-fi2-products.js";
import { seedFi2Routing, STATION_COUNT_UOM, type SeedStation } from "./seed-fi2-routing.js";
import { seedFi2Shifts } from "./seed-fi2-shifts.js";
import {
  assetKey,
  GATEWAYS,
  gatewayIdForAsset,
  isPackCounter,
  plannedTags,
  type PlannedTag,
} from "./seed-fi2-nodes.js";
import {
  areaTable,
  assetPlacementTable,
  assetTable,
  assetTagTable,
  dataSourceTable,
  enterpriseTable,
  siteTable,
  workCenterTable,
  workUnitTable,
} from "./schema/schema.js";

const VALID_FROM = "2026-02-03";
const ENTERPRISE_ID = "ent-molca";
const SITE_ID = "site-mjk";
const AREA_ID = "area-pkg-1";
// F-13 (PO 2026-10-02, prd-molcadx#24 item 4): a generated OPC UA source
// defaults to urn:molca:<cleaned site code>.
const NAMESPACE_URI = "urn:molca:MJK";

type Acquired = "" | "true" | "false";

// machine, display name, sku type, protocol, source, machine type, acquired, hw code, ip
type Row = [string, string, string, string, string, string, Acquired, string, string];

type Line = { name: string; code: string; rows: Row[] };

const LINES: Line[] = [
  {
    name: "Line 1",
    code: "FI2-1",
    rows: [
      [
        "Vertikal Packer A5RB New",
        "Vertical Packer N",
        "Single",
        "MQTT",
        "Machine PLC",
        "Main",
        "true",
        "MITSUM-1",
        "10.234.227.2",
      ],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto weigher bag", "", "", "", "CW 1", "Support", "false", "ANRITSU62-1", "10.234.227.7"],
      ["Rejector weigher bag", "", "", "", "CW 1", "", "", "", ""],
      ["Auto Wrapping 90 gr", "", "", "", "Auto Inner", "Assist", "", "", ""],
      ["Auto weigher inner", "", "", "", "CW 2", "Support", "true", "ANRITSU54-1", "10.234.227.7"],
      ["Rejector", "", "", "", "CW 2", "", "", "", ""],
      ["Carton Erector", "", "", "", "", "", "false", "SIEMENS-1", ""],
      ["Auto cartoner", "", "", "", "Machine PLC", "Assist", "", "", ""],
      [
        "Auto weigher carton",
        "",
        "",
        "",
        "CW 3",
        "Support",
        "true",
        "ANRITSU 57-1",
        "10.234.227.11",
      ],
      ["Rejector", "", "", "", "CW 3", "", "", "", ""],
    ],
  },
  {
    name: "Line 2",
    code: "FI2-2",
    rows: [
      [
        "Vertikal Packer A5RB New",
        "Vertical Packer L",
        "Single",
        "OPC UA",
        "Machine PLC",
        "Main",
        "true",
        "MITSUM-2",
        "10.234.227.2",
      ],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto weigher bag", "", "", "", "CW 1", "Support", "false", "ANRITSU62-2", "10.234.227.7"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      ["Semi-Auto Wrapping 90 gr", "", "", "", "Machine PLC", "Support", "", "", ""],
      ["Auto weigher inner", "", "", "", "CW 2", "Support", "true", "YAMATO-1", "10.234.227.7"],
      ["Rejector", "", "", "", "CW 2", "", "", "", ""],
      [
        "Auto weigher carton",
        "",
        "",
        "",
        "CW 3",
        "Support",
        "true",
        "ANRITSU57-2",
        "10.234.227.11",
      ],
      ["Rejector", "", "", "", "CW 3", "", "", "", ""],
    ],
  },
  {
    name: "Line 3",
    code: "FI2-3",
    rows: [
      [
        "Yokohama P 90 gr",
        "Vertical Packer P",
        "Single",
        "MQTT",
        "Machine PLC",
        "Main",
        "true",
        "MITSUM-3",
        "10.234.227.2",
      ],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto weigher bag", "", "", "", "CW 1", "Support", "false", "ANRITSU62-3", "10.234.227.7"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      ["Auto wrapping", "", "", "", "Machine PLC", "Assist", "", "", ""],
      ["Auto weigher inner", "", "", "", "CW 2", "Support", "true", "YAMATO-2", "10.234.227.7"],
      ["Rejector", "", "", "", "CW 2", "", "", "", ""],
      [
        "Auto weigher carton",
        "",
        "",
        "",
        "CW 3",
        "Support",
        "true",
        "ANRITSU57-3",
        "10.234.227.11",
      ],
      ["Rejector", "", "", "", "CW 3", "", "", "", ""],
    ],
  },
  {
    name: "Line 4",
    code: "FI2-4",
    rows: [
      [
        "MJCL Yokohama",
        "Packer MJCL / Vertical Packer A",
        "Single",
        "MQTT",
        "Machine PLC",
        "Main",
        "true",
        "MITSUM-6",
        "10.234.227.3",
      ],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto Folding", "", "", "", "Machine PLC", "Support", "true", "OMRONC-3", "10.234.227.3"],
      ["Rejector Folding", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto weigher 1", "", "", "", "CW 1", "Support", "true", "ANRITSU64-6", "10.234.227.8"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      ["Auto weigher 2", "", "", "", "CW 2", "Support", "true", "ANRITSU57-7", "10.234.227.12"],
      ["Rejector", "", "", "", "CW 2", "", "", "", ""],
    ],
  },
  {
    name: "Line 5",
    code: "FI2-5",
    rows: [
      ["Sanko 50 gr", "Sanko D", "Single", "", "Machine PLC", "Main", "", "SANKO-5", ""],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto wrapping 50 gr", "", "", "", "Machine PLC", "Assist", "", "", ""],
      ["Auto weigher inner", "", "", "", "CW 1", "Main", "true", "YAMATO-3", "10.234.227.14"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      [
        "Auto weigher carton",
        "",
        "",
        "",
        "CW 2",
        "Support",
        "true",
        "ANRITSU58-1",
        "10.234.227.12",
      ],
      ["Rejector", "", "", "", "CW 2", "", "", "", ""],
    ],
  },
  {
    name: "Line 6",
    code: "FI2-6",
    rows: [
      [
        "PTCL A",
        "PTCL A",
        "Single",
        "MQTT",
        "Machine PLC",
        "Main",
        "true",
        "MITSUM-4",
        "10.234.227.3",
      ],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto Folding", "", "", "", "Machine PLC", "Assist", "true", "OMRONC-1", "10.234.227.3"],
      ["Rejector Folding", "", "", "", "Machine rejector PLC", "Support", "", "", ""],
      ["Auto weigher calender", "", "", "", "CW 1", "Support", "true", "YAMATO-11", "10.234.227.8"],
      ["Rejector", "", "", "", "CW 1", "Support", "", "", ""],
      [
        "PTCL B",
        "PTCL B",
        "Single",
        "MQTT",
        "Machine PLC",
        "Main",
        "true",
        "MITSUM-5",
        "10.234.227.4",
      ],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto Folding", "", "", "", "Machine PLC", "Assist", "", "OMRONC-2", "10.234.227.4"],
      ["Rejector Folding", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto weigher calender", "", "", "", "CW 1", "Support", "true", "YAMATO-12", "10.234.227.8"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      ["Carton erector", "", "", "MQTT", "", "Assist", "", "SIEMENS-2", ""],
      ["Auto cartoning", "", "", "", "", "Assist", "", "", ""],
      [
        "Auto weigher carton",
        "",
        "",
        "",
        "CW 2",
        "Support",
        "true",
        "ANRITSU57-4",
        "10.234.227.12",
      ],
      ["Rejector", "", "", "", "CW 2", "", "", "", ""],
      ["Robot", "", "", "", "", "Assist", "", "", ""],
    ],
  },
  {
    name: "Line 7",
    code: "FI2-7",
    rows: [
      ["GP 3000 (NEW)", "", "", "TBC", "Machine PLC", "Main", "", "MISTUR-1", ""],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto weigher 1", "", "", "", "CW 1", "Support", "", "TBC", ""],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      ["Auto weigher 2", "", "", "", "CW 2", "Support", "", "TBC", ""],
      ["Rejector", "", "", "", "CW 2", "", "", "", ""],
      ["Auto weigher 3", "", "", "", "CW 3", "Support", "", "TBC", ""],
      ["Rejector", "", "", "", "CW 3", "", "", "", ""],
    ],
  },
  {
    name: "Line 8",
    code: "FI2-8",
    rows: [
      [
        "TT 10",
        "GP F",
        "Single",
        "MQTT",
        "Machine PLC",
        "Main",
        "true",
        "OMRONG-1",
        "10.234.227.5",
      ],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto weigher bag", "", "", "", "CW 1", "Support", "true", "ANRITSU64-4", "10.234.227.9"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      ["GP G", "GP G", "Single", "MQTT", "Machine PLC", "Main", "true", "OMRONM-1", "10.234.227.5"],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto weigher bag", "", "", "", "CW 1", "Support", "true", "ANRITSU64-5", "10.234.227.9"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      ["GP E", "GP E", "Single", "MQTT", "Machine PLC", "Main", "true", "OMRONM-2", "10.234.227.5"],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto weigher bag", "", "", "", "CW 1", "Support", "true", "ANRITSU64-2", "10.234.227.9"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      ["GP H", "GP H", "Single", "MQTT", "Machine PLC", "Main", "true", "OMRONM-3", "10.234.227.5"],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto weigher bag", "", "", "", "CW 1", "Support", "true", "ANRITSU62-7", "10.234.227.9"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      ["Mesin Robot (Line 9)", "", "", "", "Machine PLC", "Assist", "", "", ""],
      ["Auto weigher Inner", "", "", "", "CW 1", "Support", "true", "YAMATO-7", "10.234.227.14"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      [
        "Auto weigher carton",
        "",
        "",
        "",
        "CW 1",
        "Support",
        "true",
        "ANRITSU57-6",
        "10.234.227.13",
      ],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
    ],
  },
  {
    name: "Line 9",
    code: "FI2-9",
    rows: [
      [
        "GP K",
        "GP K",
        "Multi",
        "OPC UA",
        "Machine PLC",
        "Main",
        "true",
        "MITSUF-3",
        "10.234.227.6",
      ],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto weigher 2", "", "", "", "CW 1", "Support", "true", "ANRITSU64-3", "10.234.227.10"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      [
        "GP I",
        "GP I",
        "Multi",
        "OPC UA",
        "Machine PLC",
        "Main",
        "true",
        "MITSUF-1",
        "10.234.227.6",
      ],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto weigher 1", "", "", "", "CW 1", "Support", "true", "ANRITSU64-1", "10.234.227.10"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      ["Mesin Robot (Line 10)", "", "", "", "Machine PLC", "Assist", "", "", ""],
      ["Auto weigher 3", "", "", "", "CW 1", "Support", "false", "YAMATO-8", "10.234.227.14"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      ["Auto weigher 4", "", "", "", "CW 1", "Support", "true", "ANRITSU58-3", "10.234.227.13"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
    ],
  },
  {
    name: "Line 10",
    code: "FI2-10",
    rows: [
      [
        "Unilogo 100 gr",
        "Unilogo A",
        "Single",
        "MQTT",
        "Machine PLC",
        "Main",
        "true",
        "OMRONM-4",
        "10.234.227.6",
      ],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Semi-Auto Wrapping", "", "", "", "Machine PLC", "Support", "", "", ""],
      ["Auto weigher inner", "", "", "", "CW 1", "Support", "true", "YAMATO-10", "10.234.227.14"],
      ["Rejector", "", "", "", "CW 1", "", "", "", ""],
      [
        "Auto weigher carton",
        "",
        "",
        "",
        "CW 2",
        "Support",
        "true",
        "ANRITSU 57-8",
        "10.234.227.13",
      ],
      ["Rejector", "", "", "", "CW 2", "", "", "", ""],
    ],
  },
  {
    name: "Line 11",
    code: "FI2-11",
    rows: [
      [
        "GP C / Ajiplus",
        "",
        "Single",
        "MQTT",
        "Machine PLC",
        "Main",
        "true",
        "MITSUF-2",
        "10.234.227.4",
      ],
      ["Rejector packer", "", "", "", "Machine rejector PLC", "", "", "", ""],
      ["Auto weigher bag", "", "", "", "CW 1", "Support", "true", "YAMATO-5", "10.234.227.8"],
      ["Rejector", "", "", "", "CW 2", "", "", "", ""],
      ["Auto weigher carton", "", "", "", "CW 3", "Support", "true", "ANRITSU57-5", "10.234.227.8"],
      ["Rejector", "", "", "", "CW 3", "", "", "", ""],
    ],
  },
];

type Machine = {
  lineCode: string;
  index: number;
  machine: string;
  displayName: string;
  skuType: string;
  protocol: string;
  source: string;
  machineType: string;
  acquired: Acquired;
  hwCode: string;
  assetTag: string;
  ip: string;
  stationId: string;
};

type StationKind = "packer" | "inner" | "cartoner" | "folding" | "robot";

type Station = {
  id: string;
  code: string;
  name: string;
  lineCode: string;
  kind: StationKind;
  machines: Machine[];
};

function machineType(raw: string): string {
  if (raw === "Assisst") return "Assist";
  return raw;
}

/**
 * Every FI-2 machine is read over OPC UA (PO 2026-10-03), whatever the
 * sheet's protocol column says (MQTT, OPC UA or blank). A machine with an IP
 * gets an OPC UA data source: its gateway, or one of its own on that IP.
 */
const PROTOCOL = "opcua";

function placementRole(type: string): "primary" | "secondary" {
  return type === "Main" ? "primary" : "secondary";
}

function slug(value: string): string {
  return value.trim().replace(/\s+/g, "-");
}

function stationViews(built: Station[]): SeedStation[] {
  return built.map((station) => ({
    id: station.id,
    code: station.code,
    name: station.name,
    lineCode: station.lineCode,
    kind: station.kind,
    assets: station.machines.map((machine) => machine.assetTag),
  }));
}

function machines(): Machine[] {
  const seen = new Map<string, number>();
  const out: Machine[] = [];
  for (const line of LINES) {
    line.rows.forEach((row, index) => {
      const [machine, displayName, skuType, , source, rawType, acquired, hw, ip] = row;
      if (rowRole(machine) === "rejector") return;
      const hwCode = hw.trim();
      let assetTag = hwCode;
      if (assetTag === "") {
        assetTag = `NOHW-${line.code}-${String(index + 1).padStart(2, "0")}`;
      }
      const count = (seen.get(assetTag) ?? 0) + 1;
      seen.set(assetTag, count);
      if (count > 1) assetTag = `${assetTag}-${count}`;
      out.push({
        lineCode: line.code,
        index: index + 1,
        machine,
        displayName: displayName.trim(),
        skuType,
        protocol: PROTOCOL,
        source,
        machineType: machineType(rawType),
        acquired,
        hwCode,
        assetTag,
        ip: ip.trim(),
        stationId: "",
      });
    });
  }
  return out;
}

function rowRole(machine: string): "rejector" | "weigher" | StationKind {
  const name = machine.toLowerCase();
  if (name.startsWith("rejector")) return "rejector";
  if (name.includes("weigher")) return "weigher";
  if (name.includes("wrap")) return "inner";
  if (name.includes("fold")) return "folding";
  if (name.includes("carton") || name.includes("erector")) return "cartoner";
  if (name.includes("robot")) return "robot";
  return "packer";
}

/** A checkweigher named for a station joins that station. Others stay on the current one. */
function weigherKind(machine: string): StationKind | null {
  const name = machine.toLowerCase();
  if (name.includes("inner")) return "inner";
  if (name.includes("carton")) return "cartoner";
  if (name.includes("bag")) return "packer";
  if (name.includes("calender") || name.includes("calendar")) return "folding";
  return null;
}

function lineNumber(lineCode: string): string {
  return lineCode.replace(/^FI2-/, "");
}

function packerTitle(head: Machine): string {
  const blob = `${head.machine} ${head.displayName}`.toLowerCase();
  if (blob.includes("vertikal") || blob.includes("vertical")) return "Vertical packer";
  return head.displayName || head.machine;
}

function stationTitle(
  kind: StationKind,
  head: Machine,
  lineCode: string,
  repeat: number,
  packerLabel: string,
): string {
  const line = `line ${lineNumber(lineCode)}`;
  if (kind === "packer") return `${packerTitle(head)} ${line}`;
  const label = { inner: "Inner", cartoner: "Cartoner", folding: "Folding", robot: "Robot" }[kind];
  if (repeat > 1 && packerLabel) return `${label} ${packerLabel}`;
  return `${label} ${line}`;
}

function groupStations(rows: Machine[]): Station[] {
  const stations: Station[] = [];
  // Held on an object so assigning it inside open() stays a Station for the type checker.
  const cursor: { station: Station | null } = { station: null };
  let packerLabel = "";
  const repeats = new Map<string, number>();

  function open(kind: StationKind, head: Machine): Station {
    const key = `${head.lineCode}:${kind}`;
    const repeat = (repeats.get(key) ?? 0) + 1;
    repeats.set(key, repeat);
    const code = `S${String(stations.filter((station) => station.lineCode === head.lineCode).length + 1).padStart(2, "0")}`;
    const station: Station = {
      id: `wu-${head.lineCode.toLowerCase()}-${code.toLowerCase()}`,
      code,
      name: stationTitle(kind, head, head.lineCode, repeat, packerLabel),
      lineCode: head.lineCode,
      kind,
      machines: [],
    };
    stations.push(station);
    cursor.station = station;
    return station;
  }

  function take(kind: StationKind, machine: Machine): void {
    const station = cursor.station?.kind === kind ? cursor.station : open(kind, machine);
    machine.stationId = station.id;
    station.machines.push(machine);
  }

  for (const machine of rows) {
    if (cursor.station && cursor.station.lineCode !== machine.lineCode) {
      cursor.station = null;
      packerLabel = "";
    }
    const role = rowRole(machine.machine);
    if (role === "packer") {
      packerLabel = packerTitle(machine);
      const station = open("packer", machine);
      machine.stationId = station.id;
      station.machines.push(machine);
      continue;
    }
    if (role === "rejector") throw new Error(`Rejector ${machine.assetTag} reached grouping`);
    if (role === "weigher") {
      take(weigherKind(machine.machine) ?? cursor.station?.kind ?? "packer", machine);
      continue;
    }
    take(role, machine);
  }

  const unassigned = rows.filter((machine) => machine.stationId === "");
  if (unassigned.length) {
    throw new Error(
      `Machines left without a work unit: ${unassigned.map((machine) => machine.machine).join(", ")}`,
    );
  }
  return stations;
}

function tagId(tag: PlannedTag): string {
  return `tag-${tag.assetKey.toLowerCase()}-${tag.tagName.toLowerCase()}`;
}

/**
 * F-04 §9.7 `uom_id` per tag id: a pack counter takes the pack its station
 * produces (STATION_COUNT_UOM). A weigher's `measured_total` weight totals are
 * in grams (`uom-g`, seed-fi2-products; PO confirmed 2026-10-03), since F-04
 * §9.7 requires a unit on that role. Other roles stay empty.
 */
function tagUnits(rows: Machine[], stations: Station[], tags: PlannedTag[]): Map<string, string> {
  const kindOf = new Map(stations.map((station) => [station.id, station.kind]));
  const stationOf = new Map(rows.map((row) => [assetKey(row.assetTag), row.stationId]));
  const units = new Map<string, string>();
  for (const tag of tags) {
    const kind = kindOf.get(stationOf.get(tag.assetKey) ?? "");
    const uomId =
      tag.tagRole === "measured_total"
        ? "uom-g"
        : kind && isPackCounter(tag)
          ? STATION_COUNT_UOM[kind]
          : "";
    units.set(tagId(tag), uomId);
  }
  return units;
}

/**
 * Fills the pack unit on FI-2 counters already loaded without one, so the
 * KPI seed can bind quantity slots without reseeding the plant. Only empty
 * `uom_id`s are written; a unit someone already set is left alone.
 */
async function fillCounterUnits(db: PostgresDB, region: string, tenantId: string): Promise<number> {
  const rows = machines();
  const units = tagUnits(rows, groupStations(rows), plannedTags());
  const byUnit = new Map<string, string[]>();
  for (const [id, uomId] of units) {
    if (uomId) byUnit.set(uomId, [...(byUnit.get(uomId) ?? []), id]);
  }
  let filled = 0;
  for (const [uomId, ids] of byUnit) {
    const updated = await db
      .update(assetTagTable)
      .set({ uomId })
      .where(
        and(
          eq(assetTagTable.tenantId, tenantId),
          eq(assetTagTable.region, region),
          isNull(assetTagTable.uomId),
          inArray(assetTagTable.id, ids),
        ),
      )
      .returning({ id: assetTagTable.id });
    filled += updated.length;
  }
  return filled;
}

function attributes(machine: Machine, dataSourceId: string): Record<string, string> {
  const values: Record<string, string> = {
    sheet_machine: machine.machine,
  };
  if (machine.skuType) values.sku_type = machine.skuType;
  if (machine.protocol) values.protocol = machine.protocol;
  if (machine.source) values.source = machine.source;
  if (machine.machineType) values.machine_type = machine.machineType;
  if (machine.acquired) values.data_acquisition = machine.acquired;
  if (machine.ip) values.ip = machine.ip;
  if (machine.hwCode && machine.hwCode !== machine.assetTag) values.hw_code = machine.hwCode;
  if (dataSourceId) values.data_source_id = dataSourceId;
  return values;
}

async function main() {
  // Fails before any connection when SEED_TENANT_ID is missing (F-00 rule 6).
  const tenant = seedTenantFromEnv();
  await runInTenant({ tenantId: tenant.tenantId }, () => seedTenant(tenant));
}

async function seedTenant(tenant: SeedTenant) {
  const { tenantId } = tenant;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const region = process.env.REGION_CODE ?? "ap3";
  if (process.argv.includes("--kpi-only")) {
    await seedKpi(url, region, tenant);
    return;
  }
  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool });
  await ensureTenant(db, tenant);
  if (process.argv.includes("--products-only")) {
    await db.transaction(async (tx) => {
      await seedFi2Products(tx, region, tenantId);
      await seedFi2Routing(tx, region, tenantId, stationViews(groupStations(machines())));
    });
    await pool.end();
    return;
  }
  if (process.argv.includes("--reasons-only")) {
    const reasons = await db.transaction((tx) =>
      seedFi2Reasons(tx, region, tenantId, plannedTags()),
    );
    console.log(
      `Seeded reasons: ${reasons.downtime} downtime (unplanned), ${reasons.reject} reject`,
    );
    await pool.end();
    return;
  }
  if (process.argv.includes("--shifts-only")) {
    await seedShifts(db, region, tenantId);
    await pool.end();
    return;
  }
  if (process.argv.includes("--flows-only")) {
    await seedFi2Flows(db, region, tenantId, stationViews(groupStations(machines())));
    await pool.end();
    return;
  }
  const rows = machines();
  const stations = groupStations(rows);

  const workCenterIds = LINES.map((line) => `wc-${line.code.toLowerCase()}`);
  const assetIds = rows.map((row) => `asset-${slug(row.assetTag).toLowerCase()}`);
  const placementIds = assetIds.map((id) => `pl-${id}`);

  const sources = new Map<string, { id: string; name: string; protocol: string; ip: string }>();
  for (const row of rows) {
    if (!row.protocol || !row.ip || gatewayIdForAsset(row.assetTag)) continue;
    const key = `${row.protocol}|${row.ip}`;
    if (sources.has(key)) continue;
    sources.set(key, {
      id: `ds-${row.protocol}-${row.ip.replaceAll(".", "-")}`,
      name: `${row.protocol} ${row.ip}`,
      protocol: row.protocol,
      ip: row.ip,
    });
  }
  const gatewayIds = GATEWAYS.map((gateway) => gateway.id);
  const tags = plannedTags();
  const units = tagUnits(rows, stations, tags);
  const assetByKey = new Map(rows.map((row) => [assetKey(row.assetTag), row]));
  const missing = [...new Set(tags.map((tag) => tag.assetKey))].filter(
    (key) => !assetByKey.has(key),
  );
  if (missing.length)
    throw new Error(`Node sheet machines missing from the line sheet: ${missing.join(", ")}`);

  for (const station of stations) {
    console.log(
      `${station.lineCode} ${station.code} ${station.name}: ${station.machines.map((machine) => machine.machine).join(", ")}`,
    );
  }

  await db.transaction(async (tx) => {
    // Every delete is limited to this tenant: a re-seed never touches another tenant's rows.
    if (assetIds.length)
      await tx
        .delete(assetTagTable)
        .where(and(eq(assetTagTable.tenantId, tenantId), inArray(assetTagTable.assetId, assetIds)));
    if (placementIds.length)
      await tx
        .delete(assetPlacementTable)
        .where(
          and(
            eq(assetPlacementTable.tenantId, tenantId),
            inArray(assetPlacementTable.id, placementIds),
          ),
        );
    if (assetIds.length)
      await tx
        .delete(assetTable)
        .where(and(eq(assetTable.tenantId, tenantId), inArray(assetTable.id, assetIds)));
    if (workCenterIds.length)
      await tx
        .delete(workUnitTable)
        .where(
          and(
            eq(workUnitTable.tenantId, tenantId),
            inArray(workUnitTable.workCenterId, workCenterIds),
          ),
        );
    if (workCenterIds.length)
      await tx
        .delete(workCenterTable)
        .where(
          and(eq(workCenterTable.tenantId, tenantId), inArray(workCenterTable.id, workCenterIds)),
        );
    await tx
      .delete(dataSourceTable)
      .where(
        and(
          eq(dataSourceTable.tenantId, tenantId),
          or(
            like(dataSourceTable.id, "ds-mqtt-%"),
            like(dataSourceTable.id, "ds-opcua-%"),
            inArray(dataSourceTable.id, gatewayIds),
          ),
        ),
      );
    await tx
      .delete(areaTable)
      .where(and(eq(areaTable.tenantId, tenantId), inArray(areaTable.id, [AREA_ID])));
    await tx
      .delete(siteTable)
      .where(and(eq(siteTable.tenantId, tenantId), inArray(siteTable.id, [SITE_ID])));

    await tx
      .insert(enterpriseTable)
      .values({
        id: ENTERPRISE_ID,
        region,
        tenantId,
        code: "MOLCA",
        name: "Molca",
        validFrom: VALID_FROM,
      })
      .onConflictDoNothing();

    await tx.insert(siteTable).values({
      id: SITE_ID,
      region,
      tenantId,
      enterpriseId: ENTERPRISE_ID,
      code: "MJK",
      name: "Mojokerto",
      timezone: "Asia/Jakarta",
      validFrom: VALID_FROM,
    });

    await tx.insert(areaTable).values({
      id: AREA_ID,
      region,
      tenantId,
      siteId: SITE_ID,
      code: "FI-2",
      name: "Packaging 01",
      validFrom: VALID_FROM,
    });

    await tx.insert(workCenterTable).values(
      LINES.map((line) => ({
        id: `wc-${line.code.toLowerCase()}`,
        region,
        tenantId,
        areaId: AREA_ID,
        code: line.code,
        name: line.name,
        type: "production_line" as const,
        validFrom: VALID_FROM,
      })),
    );

    await tx.insert(workUnitTable).values(
      stations.map((station) => ({
        id: station.id,
        region,
        tenantId,
        workCenterId: `wc-${station.lineCode.toLowerCase()}`,
        code: station.code,
        name: station.name,
        validFrom: VALID_FROM,
      })),
    );

    const dataSources = [
      ...[...sources.values()].map((source) => ({
        id: source.id,
        region,
        tenantId,
        siteId: SITE_ID,
        name: source.name,
        protocol: "opcua" as const,
        nodeNaming: "generated" as const,
        namespaceUri: NAMESPACE_URI,
        connectionConfig: { host: source.ip },
        validFrom: VALID_FROM,
      })),
      ...GATEWAYS.map((gateway) => ({
        id: gateway.id,
        region,
        tenantId,
        siteId: SITE_ID,
        name: gateway.name,
        protocol: "opcua" as const,
        nodeNaming: "generated" as const,
        namespaceUri: NAMESPACE_URI,
        connectionConfig: { host: gateway.host, port: gateway.port },
        validFrom: VALID_FROM,
      })),
    ];
    if (dataSources.length) await tx.insert(dataSourceTable).values(dataSources);

    await tx.insert(assetTable).values(
      rows.map((row) => {
        const gatewayId = gatewayIdForAsset(row.assetTag);
        const source = gatewayId
          ? undefined
          : row.protocol && row.ip
            ? sources.get(`${row.protocol}|${row.ip}`)
            : undefined;
        return {
          id: `asset-${slug(row.assetTag).toLowerCase()}`,
          region,
          tenantId,
          assetTag: row.assetTag,
          assetName: row.displayName || row.machine,
          componentLevel: "equipment_unit" as const,
          // Every sheet machine runs on its line and is placed on a station,
          // and only an operational machine may be placed (F-04 §9.4). The
          // sheet's "acquired" column is data acquisition, kept as an attribute.
          lifecycleStatus: "operational" as const,
          attributes: attributes(row, gatewayId || source?.id || ""),
          validFrom: VALID_FROM,
        };
      }),
    );

    await tx.insert(assetTagTable).values(
      tags.map((tag) => {
        const row = assetByKey.get(tag.assetKey);
        if (!row) throw new Error(`missing asset ${tag.assetKey}`);
        return {
          id: tagId(tag),
          region,
          tenantId,
          assetId: `asset-${slug(row.assetTag).toLowerCase()}`,
          dataSourceId: tag.sourceId,
          tagName: tag.tagName,
          node: "",
          workUnitId: row.stationId,
          kind: tag.kind,
          tagRole: tag.tagRole || null,
          uomId: units.get(tagId(tag)) || null,
          countBasis: tag.countBasis || null,
          // F-04 §9.7: every FI-2 counter counts the station's own output.
          countSide: ["total", "good", "reject"].includes(tag.tagRole) ? ("output" as const) : null,
          validFrom: VALID_FROM,
        };
      }),
    );

    const primaryTaken = new Set<string>();
    await tx.insert(assetPlacementTable).values(
      rows.map((row) => {
        let role = placementRole(row.machineType);
        if (role === "primary" && primaryTaken.has(row.stationId)) role = "secondary";
        if (role === "primary") primaryTaken.add(row.stationId);
        return {
          id: `pl-asset-${slug(row.assetTag).toLowerCase()}`,
          region,
          tenantId,
          assetId: `asset-${slug(row.assetTag).toLowerCase()}`,
          workUnitId: row.stationId,
          placementRole: role,
          validFrom: VALID_FROM,
        };
      }),
    );

    await seedFi2Products(tx, region, tenantId);
    await seedFi2Routing(tx, region, tenantId, stationViews(stations));
    await seedFi2Flows(tx, region, tenantId, stationViews(stations));
    const reasons = await seedFi2Reasons(tx, region, tenantId, tags);
    console.log(
      `Seeded reasons: ${reasons.downtime} downtime (unplanned), ${reasons.reject} reject`,
    );
    await seedShifts(tx, region, tenantId);
  });

  await pool.end();
  console.log(
    `Seeded Mojokerto / FI-2: ${LINES.length} lines, ${stations.length} work units, ${rows.length} machines, ${sources.size + GATEWAYS.length} data sources, ${tags.length} nodes`,
  );
  await seedKpi(url, region, tenant);
}

/** Real shifts from the 1st of this month to 30 days ahead, like the API's own generator run; `--from=` / `--to=` (YYYY-MM-DD) change the range. */
async function seedShifts(db: NodePgDatabase, region: string, tenantId: string) {
  const arg = (name: string) =>
    process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const today = new Date().toISOString().slice(0, 10);
  const from = arg("from") ?? `${today.slice(0, 8)}01`;
  const to = arg("to") ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const result = await seedFi2Shifts(db, region, tenantId, SITE_ID, from, to);
  console.log(
    `Seeded Mojokerto shifts: ${result.hours} site shift hours added, ${result.created} shift instances ${from} to ${to}`,
  );
}

async function seedKpi(url: string, region: string, tenant: SeedTenant) {
  const db = createPostgresDb({ connectionString: url });
  await ensureTenant(db, tenant);
  const filled = await fillCounterUnits(db, region, tenant.tenantId);
  console.log(`Filled the pack unit on ${filled} FI-2 counters`);
  const result = await seedFi2Kpi(db, region, tenant.tenantId);
  await db.$client.end();
  for (const line of result.skipped) console.log(`KPI binding skipped — ${line}`);
  console.log(
    `Seeded production KPIs: ${result.slots} slots, ${result.parameters} parameters, ${result.bound} bindings (${result.skipped.length} skipped)`,
  );
}

await main();
