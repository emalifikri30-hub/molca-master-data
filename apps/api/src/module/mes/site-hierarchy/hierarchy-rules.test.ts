import { describe, it, expect } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import {
  CODE_PATTERN,
  WORK_UNIT_CODE_PATTERN,
  assertCodeAvailable,
  codeConflictMessage,
  findCodeConflict,
  isIanaTimezone,
} from "./hierarchy-rules.js";
import { AreasStore } from "../areas/areas-store.js";
import type { SitesReader, SitesWriter } from "../sites/sites-repository.js";
import { SitesService } from "../sites/sites-service.js";
import { SitesStore } from "../sites/sites-store.js";
import type { CreateSites, UpdateSites } from "../sites/sites.js";
import { WorkCentersService } from "../work-centers/work-centers-service.js";
import { WorkCentersStore } from "../work-centers/work-centers-store.js";
import { WorkUnitsService } from "../work-units/work-units-service.js";
import { WorkUnitsStore } from "../work-units/work-units-store.js";

const ROWS = [
  { id: "a", code: "L01", name: "Line 1" },
  { id: "b", code: "L02", name: "Line 2" },
];

function conflictOf(fn: () => unknown): HTTPException | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof HTTPException) return err;
    throw err;
  }
  return undefined;
}

describe("findCodeConflict", () => {
  it("returns the row already using the code", () => {
    expect(findCodeConflict(ROWS, "L01")?.id).toBe("a");
  });

  it("ignores the row being edited", () => {
    expect(findCodeConflict(ROWS, "L01", "a")).toBeUndefined();
  });

  it("returns undefined for a free code", () => {
    expect(findCodeConflict(ROWS, "L03")).toBeUndefined();
  });

  // docs-molcadx#142: case and surrounding spaces are ignored; saved as typed.
  it("matches a code that differs only by case", () => {
    expect(findCodeConflict([{ id: "fi", code: "FI2-1", name: "FI2 line" }], "fi2-1")?.id).toBe(
      "fi",
    );
  });

  it("matches a code that differs only by surrounding spaces", () => {
    expect(findCodeConflict([{ id: "fi", code: "FI2-1", name: "FI2 line" }], " FI2-1 ")?.name).toBe(
      "FI2 line",
    );
  });

  it("still ignores the row being edited when only the case differs", () => {
    expect(findCodeConflict([{ id: "fi", code: "FI2-1", name: "FI2 line" }], "fi2-1", "fi")).toBe(
      undefined,
    );
  });
});

describe("assertCodeAvailable", () => {
  it("throws 409 naming the node already using the code", () => {
    const err = conflictOf(() => assertCodeAvailable(ROWS, "L02"));
    expect(err?.status).toBe(409);
    expect(err?.message).toBe(codeConflictMessage("L02", "Line 2"));
    expect(err?.message).toBe("Code L02 is already used by Line 2. Use another code.");
  });
});

describe("assertCodeAvailable (docs-molcadx#142)", () => {
  it("refuses a case-variant code, naming the holder with the code as typed", () => {
    const err = conflictOf(() => assertCodeAvailable(ROWS, "l02"));
    expect(err?.status).toBe(409);
    expect(err?.message).toBe("Code l02 is already used by Line 2. Use another code.");
  });
});

describe("isIanaTimezone", () => {
  it("accepts IANA names", () => {
    expect(isIanaTimezone("Asia/Jakarta")).toBe(true);
  });

  it("rejects fixed offsets and empty values", () => {
    expect(isIanaTimezone("+07:00")).toBe(false);
    expect(isIanaTimezone("")).toBe(false);
  });
});

class MemorySitesReader implements SitesReader {
  constructor(private store: SitesStore) {}

  paginate(input: { limit: number; offset: number; q?: string }) {
    return Promise.resolve(this.store.paginate(input));
  }

  async listByEnterprise(enterpriseId: string) {
    return (await this.store.all()).filter((r) => r.enterpriseId === enterpriseId);
  }

  get(id: string) {
    return Promise.resolve(this.store.get(id));
  }
}

class MemorySitesWriter implements SitesWriter {
  constructor(private store: SitesStore) {}

  create(input: CreateSites) {
    return Promise.resolve(this.store.create(input));
  }

  update(id: string, patch: UpdateSites) {
    return Promise.resolve(this.store.update(id, patch));
  }
}

function sitesService(): SitesService {
  const store = new SitesStore();
  return new SitesService({
    sitesReaderRepository: new MemorySitesReader(store),
    sitesWriterRepository: new MemorySitesWriter(store),
  });
}

describe("code uniqueness scopes (rule 2)", () => {
  it("site code is unique within its enterprise", async () => {
    const service = sitesService();
    const err = await service
      .create({
        enterpriseId: "ent-1",
        code: "SITE_01",
        name: "Dup",
        timezone: "Asia/Jakarta",
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HTTPException);
    expect((err as HTTPException).status).toBe(409);
    expect((err as HTTPException).message).toBe(
      "Code SITE_01 is already used by Bekasi Plant. Use another code.",
    );
    // Same code under another enterprise is fine.
    expect(
      (await service.create({ enterpriseId: "ent-2", code: "SITE_01", name: "X", timezone: "UTC" }))
        .code,
    ).toBe("SITE_01");
  });

  it("editing a site without changing its code is not a conflict", async () => {
    const service = sitesService();
    expect((await service.update("site-1", { name: "Renamed" })).name).toBe("Renamed");
  });

  it("work center code is unique within its area, not across the site (SIT-001 rule 2)", async () => {
    const service = new WorkCentersService({
      workCentersStore: new WorkCentersStore(),
      areasStore: new AreasStore(),
    });
    // WC_01 lives in area-1 (site-1): the same code under area-1 is refused.
    const err = await service
      .create({ code: "WC_01", name: "Dup", areaId: "area-1", type: "production_line" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HTTPException);
    expect((err as HTTPException).status).toBe(409);
    expect((err as HTTPException).message).toBe(
      "Code WC_01 is already used by Packaging Line 1. Use another code.",
    );
    // area-2 is another area of site-1: the same code is allowed there (AC-18).
    expect(
      (
        await service.create({
          code: "WC_01",
          name: "Other",
          areaId: "area-2",
          type: "storage_zone",
        })
      ).type,
    ).toBe("storage_zone");
  });

  it("work unit code is unique within its work center", async () => {
    const service = new WorkUnitsService({ workUnitsStore: new WorkUnitsStore() });
    const err = await service
      .create({ code: "WU_01", name: "Dup", workCenterId: "wc-1" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HTTPException);
    expect((err as HTTPException).status).toBe(409);
    expect((await service.create({ code: "WU_01", name: "Ok", workCenterId: "wc-2" })).code).toBe(
      "WU_01",
    );
    // Moving/renaming onto a taken code is refused too.
    const rename = await service.update("wu-2", { code: "WU_01" }).catch((e: unknown) => e);
    expect(rename).toBeInstanceOf(HTTPException);
    expect((rename as HTTPException).status).toBe(409);
  });
});

describe("code characters and segment clash (rule 9, PO 2026-10-02)", () => {
  it("saves a site code with `-` as typed; a work unit code refuses it (AC-11, S-10)", () => {
    expect(CODE_PATTERN.test("FI-2")).toBe(true);
    expect(CODE_PATTERN.test("JKT1.AS")).toBe(false);
    expect(CODE_PATTERN.test("L/01")).toBe(false);
    expect(WORK_UNIT_CODE_PATTERN.test("S01")).toBe(true);
    expect(WORK_UNIT_CODE_PATTERN.test("S-01")).toBe(false);
  });

  it("refuses a sibling whose code cleans to the same segment (AC-16)", () => {
    const err = conflictOf(() =>
      assertCodeAvailable([{ id: "a", code: "FI-2", name: "FI-2" }], "FI_2"),
    );
    expect(err?.status).toBe(409);
    expect(err?.message).toBe(
      "FI-2 and FI_2 both become FI_2 in the tag address. Change one of them.",
    );
  });

  it("does not count the row being edited as its own clash", () => {
    expect(
      conflictOf(() => assertCodeAvailable([{ id: "a", code: "FI-2", name: "FI-2" }], "FI_2", "a")),
    ).toBeUndefined();
  });
});

// PRD-003 SIT-001 rule 2 (PO, 2026-10-21): the code is unique among ACTIVE rows
// of its scope; a work center code is scoped to its own area.
describe("active rows only and area scope (SIT-001 rule 2)", () => {
  function workCentersService() {
    return new WorkCentersService({
      workCentersStore: new WorkCentersStore(),
      areasStore: new AreasStore(),
    });
  }

  it("SIT-001 AC-2: a second L01 under the same area is refused, naming the holder", async () => {
    const service = workCentersService();
    await service.create({
      code: "L01",
      name: "Line 1",
      areaId: "area-1",
      type: "production_line",
    });
    const err = await service
      .create({ code: "L01", name: "Line 1b", areaId: "area-1", type: "production_line" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HTTPException);
    expect((err as HTTPException).status).toBe(409);
    expect((err as HTTPException).message).toBe(
      "Code L01 is already used by Line 1. Use another code.",
    );
  });

  it("SIT-001 AC-18: an L01 in area AS does not block an L01 in area FI of the same site", async () => {
    const service = workCentersService();
    await service.create({
      code: "L01",
      name: "Line 1",
      areaId: "area-1",
      type: "production_line",
    });
    const saved = await service.create({
      code: "L01",
      name: "Line 1 FI",
      areaId: "area-2",
      type: "production_line",
    });
    expect(saved.code).toBe("L01");
    expect(saved.areaId).toBe("area-2");
  });

  it("SIT-001 AC-19: a deactivated L01 (valid to 2026-10-01) frees its code under the same area", async () => {
    const store = new WorkCentersStore();
    const service = new WorkCentersService({
      workCentersStore: store,
      areasStore: new AreasStore(),
    });
    const old = await service.create({
      code: "L01",
      name: "Old line",
      areaId: "area-1",
      type: "production_line",
    });
    await store.update(old.id, { validTo: "2026-10-01" });
    const saved = await service.create({
      code: "L01",
      name: "New line",
      areaId: "area-1",
      type: "production_line",
    });
    expect(saved.name).toBe("New line");
  });

  it("a retired work center still counts for the segment clash (rule 9 unchanged)", async () => {
    const store = new WorkCentersStore();
    const service = new WorkCentersService({
      workCentersStore: store,
      areasStore: new AreasStore(),
    });
    const old = await service.create({
      code: "FI-2",
      name: "Old",
      areaId: "area-1",
      type: "production_line",
    });
    await store.update(old.id, { validTo: "2026-10-01" });
    const err = await service
      .create({ code: "FI_2", name: "New", areaId: "area-1", type: "production_line" })
      .catch((e: unknown) => e);
    expect((err as HTTPException).status).toBe(409);
    expect((err as HTTPException).message).toBe(
      "FI-2 and FI_2 both become FI_2 in the tag address. Change one of them.",
    );
  });
});
