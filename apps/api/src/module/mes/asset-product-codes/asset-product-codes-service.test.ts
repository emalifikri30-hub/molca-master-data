import { beforeEach, describe, expect, it } from "vite-plus/test";
import { HTTPException } from "hono/http-exception";

import { codeStatus } from "./asset-product-codes-rules.js";
import { AssetProductCodesService } from "./asset-product-codes-service.js";
import { AssetProductCodesStore } from "./asset-product-codes-store.js";

import type { AssetPlacementsStore } from "../asset-placements/asset-placements-store.js";
import type { AssetTagsStore } from "../asset-tags/asset-tags-store.js";
import type { AssetTags } from "../asset-tags/asset-tags.js";
import type { ProductsReader } from "../products/products-repository.js";

async function refusalOf(fn: () => unknown): Promise<Record<string, unknown>> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof HTTPException) return JSON.parse(err.message.slice("REFUSAL:".length));
    throw err;
  }
  throw new Error("expected a refusal");
}

function tag(
  id: string,
  assetId: string,
  tagRole: AssetTags["tagRole"] = "product_code",
): AssetTags {
  return {
    id,
    assetId,
    dataSourceId: "ds-1",
    tagName: id,
    node: "",
    kind: "value",
    tagRole,
    rejectReasonId: "",
    downtimeReasonId: "",
    uomId: "",
    countBasis: "",
    countSide: "",
    validFrom: "2026-01-01",
    validTo: null,
  };
}

// PCK01 has two product_code tags (the AC-4 "two tags" case); PCK02 one.
const TAGS = [
  tag("t-pck01", "PCK01"),
  tag("t-pck01-b", "PCK01"),
  tag("t-pck02", "PCK02"),
  tag("t-total", "PCK01", "total"),
];

const NOW = "2026-10-01T03:00:00.000Z"; // 10:00 WIB

// PCK01 stands on one work unit; PCK02 on two lanes (its tag names no lane).
const PLACEMENTS = [
  { assetId: "PCK01", workUnitId: "wu-a", validTo: null },
  { assetId: "PCK02", workUnitId: "wu-b1", validTo: null },
  { assetId: "PCK02", workUnitId: "wu-b2", validTo: null },
];

let service: AssetProductCodesService;
let store: AssetProductCodesStore;

function makeService(codes: AssetProductCodesStore) {
  return new AssetProductCodesService({
    assetProductCodesStore: codes,
    assetTagsStore: {
      get: (id: string) => TAGS.find((t) => t.id === id),
    } as unknown as AssetTagsStore,
    assetPlacementsStore: {
      byAsset: (assetId: string) =>
        Promise.resolve(PLACEMENTS.filter((p) => p.assetId === assetId)),
    } as unknown as AssetPlacementsStore,
    productsReaderRepository: {
      getProduct: (id: string) =>
        Promise.resolve([{ id: "FG-1001" }, { id: "FG-2002" }].find((p) => p.id === id)),
    } as unknown as ProductsReader,
  });
}

beforeEach(() => {
  store = new AssetProductCodesStore();
  service = makeService(store);
});

const add = (
  tagId: string,
  rawValue: string,
  productId: string,
  validFrom = NOW,
  validTo?: string,
) => service.create({ tagId, rawValue, productId, validFrom, validTo });

describe("US-FND-WMS-006 product codes", () => {
  it("adds a code that is active from now (WMS-006 AC-1)", async () => {
    const row = await add("t-pck01", "12", "FG-1001");
    expect(codeStatus(row, NOW)).toBe("active");
    expect(await service.resolve("t-pck01", "12", NOW)).toBe("FG-1001");
  });

  it("keeps several active codes for one product on one machine (WMS-006 AC-2)", async () => {
    await add("t-pck01", "12", "FG-1001");
    await add("t-pck01", "112", "FG-1001");
    expect(await service.resolve("t-pck01", "12", NOW)).toBe("FG-1001");
    expect(await service.resolve("t-pck01", "112", NOW)).toBe("FG-1001");
  });

  it("allows the same code on another machine (WMS-006 AC-3)", async () => {
    await add("t-pck01", "12", "FG-1001");
    await expect(add("t-pck02", "12", "FG-2002")).resolves.toBeTruthy();
    expect(await service.resolve("t-pck02", "12", NOW)).toBe("FG-2002");
  });

  it("refuses an overlap on the same machine, naming the other product (WMS-006 AC-4)", async () => {
    await add("t-pck01", "12", "FG-2002", "2026-09-01T00:00:00.000Z");
    expect(await refusalOf(() => add("t-pck01", "12", "FG-1001"))).toEqual({
      code: "overlap",
      rawValue: "12",
      assetId: "PCK01",
      productId: "FG-2002",
      validFrom: "2026-09-01T00:00:00.000Z",
    });
  });

  it("refuses the overlap across two product_code tags of one machine (WMS-006 AC-4)", async () => {
    await add("t-pck01", "12", "FG-2002");
    expect((await refusalOf(() => add("t-pck01-b", "12", "FG-1001"))).code).toBe("overlap");
  });

  it("compares the raw value exactly: 012 is not 12 (WMS-006 AC-5)", async () => {
    await add("t-pck01", "12", "FG-1001");
    expect(await service.resolve("t-pck01", "012", NOW)).toBeNull();
    expect(await service.resolve("t-pck01", "12 ", NOW)).toBeNull();
  });

  it("ends a code and adds the next one from the same time, both kept (WMS-006 AC-6)", async () => {
    const first = await add("t-pck01", "12", "FG-1001", "2026-10-01T00:00:00.000Z");
    const at14 = "2026-10-01T07:00:00.000Z"; // 14:00 WIB
    await service.end(first.id, at14, "Code reused", NOW);
    await add("t-pck01", "0012", "FG-1001", at14);
    expect(await service.resolve("t-pck01", "12", "2026-10-01T06:59:00.000Z")).toBe("FG-1001");
    expect(await service.resolve("t-pck01", "12", "2026-10-01T07:01:00.000Z")).toBeNull();
    expect(await service.resolve("t-pck01", "0012", "2026-10-01T07:01:00.000Z")).toBe("FG-1001");
    expect((await service.getPaged(1, 10, { tagId: "t-pck01" })).items).toHaveLength(2);
  });

  it("frees the code for another product once ended (WMS-006 rule 1)", async () => {
    const first = await add("t-pck01", "12", "FG-2002", "2026-09-01T00:00:00.000Z");
    await service.end(first.id, NOW, "Code reused", NOW);
    await expect(add("t-pck01", "12", "FG-1001")).resolves.toBeTruthy();
  });

  it("refuses a missing code or start, and an end not after the start (WMS-006 rule 4)", async () => {
    expect((await refusalOf(() => add("t-pck01", "", "FG-1001"))).code).toBe("required");
    expect((await refusalOf(() => add("t-pck01", "12", "FG-1001", ""))).code).toBe("required");
    expect((await refusalOf(() => add("t-pck01", "12", "FG-1001", NOW, NOW))).code).toBe("order");
  });

  it("only takes codes on product_code tags (WMS-006 rule 3)", async () => {
    expect((await refusalOf(() => add("t-total", "12", "FG-1001"))).code).toBe(
      "not_product_code_tag",
    );
  });

  it("deletes only a row that has not started (WMS-006 rule 5)", async () => {
    const active = await add("t-pck01", "12", "FG-1001");
    const later = await add("t-pck01", "13", "FG-1001", "2026-11-01T00:00:00.000Z");
    expect((await refusalOf(() => service.remove(active.id, "Typo", NOW))).code).toBe(
      "not_scheduled",
    );
    expect(await service.remove(later.id, "Typo", NOW)).toBe(later.id);
  });

  it("does not end a row that has already ended (WMS-006 rule 5)", async () => {
    const row = await add(
      "t-pck01",
      "7",
      "FG-1001",
      "2026-09-01T00:00:00.000Z",
      "2026-09-30T15:00:00.000Z",
    );
    expect((await refusalOf(() => service.end(row.id, NOW, "Code reused", NOW))).code).toBe(
      "already_ended",
    );
  });

  it("shows Active, Scheduled and Ended by time (WMS-006 §4 example)", async () => {
    expect(codeStatus({ validFrom: "2026-10-01T00:00:00.000Z", validTo: null }, NOW)).toBe(
      "active",
    );
    expect(codeStatus({ validFrom: "2026-10-31T17:00:00.000Z", validTo: null }, NOW)).toBe(
      "scheduled",
    );
    expect(
      codeStatus(
        { validFrom: "2026-09-01T00:00:00.000Z", validTo: "2026-09-30T15:00:00.000Z" },
        NOW,
      ),
    ).toBe("ended");
  });

  it("refuses End and Delete without a reason, writing nothing (AC-12)", async () => {
    const row = await service.create({
      tagId: "t-pck01",
      rawValue: "88",
      productId: "FG-2002",
      validFrom: "2099-01-01T00:00:00.000Z",
    });
    expect(
      (await refusalOf(() => service.end(row.id, "2099-02-01T00:00:00.000Z", " ", NOW))).code,
    ).toBe("reason_required");
    expect((await refusalOf(() => service.remove(row.id, "", NOW))).code).toBe("reason_required");
    expect((await service.get(row.id)).validTo).toBeNull();
  });
});

// F-04 §9.7 ASSET_PRODUCT_CODE_CHANGE (docs-molcadx#95): the source of the
// `product_code_mapping_change` view PRODUCTION reads to recalculate shifts.
describe("US-FND-WMS-006 code change rows", () => {
  const FROM = "2026-09-30T15:10:00.000Z"; // 2026-09-30 22:10 WIB
  const END = "2026-09-30T23:30:00.000Z"; // 2026-10-01 06:30 WIB

  it("writes the exact old and new period when a mapping is ended (WMS-006 AC-7a)", async () => {
    const row = await add("t-pck01", "77", "FG-1001", FROM);
    await service.end(row.id, END, "Changeover to FG-2002", NOW);
    const changes = await store.changes();
    expect(changes).toHaveLength(2);
    expect(changes[1]).toMatchObject({
      assetProductCodeId: row.id,
      workUnitId: "wu-a",
      rawValue: "77",
      action: "end",
      oldValidFrom: FROM,
      oldValidTo: null,
      newValidFrom: FROM,
      newValidTo: END,
      changedAt: NOW,
    });
  });

  it("writes an add row with no old period (WMS-006 AC-7a)", async () => {
    const row = await add("t-pck01", "77", "FG-1001", FROM);
    expect(await store.changes()).toEqual([
      expect.objectContaining({
        assetProductCodeId: row.id,
        action: "add",
        oldValidFrom: null,
        oldValidTo: null,
        newValidFrom: FROM,
        newValidTo: null,
      }),
    ]);
  });

  it("writes a delete row with no new period (WMS-006 AC-7a)", async () => {
    const row = await add("t-pck01", "88", "FG-2002", "2099-01-01T00:00:00.000Z");
    await service.remove(row.id, "Plan dropped", NOW);
    expect((await store.changes())[1]).toMatchObject({
      action: "delete",
      oldValidFrom: "2099-01-01T00:00:00.000Z",
      oldValidTo: null,
      newValidFrom: null,
      newValidTo: null,
    });
  });

  it("writes no change row when the mapping save fails (WMS-006 AC-7a)", async () => {
    await add("t-pck01", "12", "FG-1001");
    await refusalOf(() => add("t-pck01-b", "12", "FG-2002"));
    expect(await store.changes()).toHaveLength(1);

    class FailingEnd extends AssetProductCodesStore {
      override async end(): Promise<undefined> {
        throw new Error("database down");
      }
    }
    const failing = new FailingEnd();
    const svc = makeService(failing);
    const row = await svc.create({
      tagId: "t-pck01",
      rawValue: "77",
      productId: "FG-1001",
      validFrom: FROM,
    });
    await expect(svc.end(row.id, END, "Changeover", NOW)).rejects.toThrow("database down");
    expect((await failing.changes()).map((c) => c.action)).toEqual(["add"]);
  });

  it("leaves the work unit empty when the machine is on two lanes and the tag names none", async () => {
    await add("t-pck02", "5", "FG-1001", FROM);
    expect((await store.changes())[0]!.workUnitId).toBeNull();
  });
});

describe("US-FND-WMS-006 Edit (PO 2026-10-04)", () => {
  const SINCE = "2026-09-30T15:10:00.000Z"; // 2026-09-30 22:10 WIB
  const AT = "2026-10-03T23:00:00.000Z"; // 2026-10-04 06:00 WIB
  const LATER = "2026-10-04T03:00:00.000Z";

  it("ends the row and opens the new code from the effective time, one edit change row (WMS-006 AC-6, AC-7b)", async () => {
    const row = await add("t-pck01", "12", "FG-1001", SINCE);
    const edited = await service.edit(
      row.id,
      { rawValue: "0012", effectiveFrom: AT },
      "PLC sends a padded code",
      LATER,
    );
    expect(edited.id).not.toBe(row.id);
    expect(await service.resolve("t-pck01", "12", "2026-10-02T00:00:00.000Z")).toBe("FG-1001");
    expect(await service.resolve("t-pck01", "0012", LATER)).toBe("FG-1001");
    expect(await service.resolve("t-pck01", "12", LATER)).toBeNull();
    const changes = (await store.changes()).filter((c) => c.action === "edit");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      assetProductCodeId: edited.id,
      oldValidFrom: SINCE,
      oldValidTo: null,
      newValidFrom: AT,
      newValidTo: null,
    });
  });

  it("allows a back-dated effective time inside the row (F-00 back-dating)", async () => {
    const row = await add("t-pck01", "12", "FG-1001", SINCE);
    const edited = await service.edit(
      row.id,
      { rawValue: "0012", effectiveFrom: AT },
      "Fix",
      "2026-10-05T00:00:00.000Z",
    );
    expect(edited.validFrom).toBe(AT);
  });

  it("refuses an effective time at or before the row's start", async () => {
    const row = await add("t-pck01", "12", "FG-1001", SINCE);
    expect(
      (
        await refusalOf(() =>
          service.edit(row.id, { rawValue: "0012", effectiveFrom: SINCE }, "x", LATER),
        )
      ).code,
    ).toBe("edit_before_start");
  });

  it("changes a scheduled row in place, keeping its id", async () => {
    const row = await add("t-pck01", "12", "FG-1001", "2026-12-01T00:00:00.000Z");
    const edited = await service.edit(
      row.id,
      { rawValue: "13", effectiveFrom: "2026-12-02T00:00:00.000Z" },
      "Typo",
      NOW,
    );
    expect(edited.id).toBe(row.id);
    expect(edited.rawValue).toBe("13");
    expect((await store.changes()).at(-1)!.action).toBe("edit");
  });

  it("refuses an Edit without a reason, writing nothing (rule 9)", async () => {
    const row = await add("t-pck01", "12", "FG-1001", SINCE);
    expect(
      (
        await refusalOf(() =>
          service.edit(row.id, { rawValue: "0012", effectiveFrom: AT }, " ", LATER),
        )
      ).code,
    ).toBe("reason_required");
    expect((await store.changes()).map((c) => c.action)).toEqual(["add"]);
  });

  it("refuses an Edit that overlaps the same code on the machine (rule 1)", async () => {
    await add("t-pck01-b", "0012", "FG-2002", SINCE);
    const row = await add("t-pck01", "12", "FG-1001", SINCE);
    expect(
      (
        await refusalOf(() =>
          service.edit(row.id, { rawValue: "0012", effectiveFrom: AT }, "x", LATER),
        )
      ).code,
    ).toBe("overlap");
  });
});
