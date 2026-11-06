import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import { refusal } from "../../../shared/errors/refusal.js";
import {
  checkCodeInput,
  codeStatus,
  findOverlap,
  resolveProduct,
} from "./asset-product-codes-rules.js";

import type {
  AssetProductCodeChange,
  AssetProductCodes,
  AssetProductCodesFilter,
  CreateAssetProductCodes,
  EditAssetProductCodes,
} from "./asset-product-codes.js";
import type { AssetCodeRow } from "./asset-product-codes-rules.js";
import type { AssetProductCodesStore } from "./asset-product-codes-store.js";
import type { AssetPlacementsStore } from "../asset-placements/asset-placements-store.js";
import type { AssetTagsStore } from "../asset-tags/asset-tags-store.js";
import type { ProductsReader } from "../products/products-repository.js";

type PagedAssetProductCodesResult = PagedResult<AssetProductCodes>;

type TAssetProductCodesService = {
  getPaged: (
    page: number,
    size: number,
    filter: AssetProductCodesFilter,
  ) => Promise<PagedAssetProductCodesResult>;
  get: (id: string) => Promise<AssetProductCodes>;
  create: (input: CreateAssetProductCodes) => Promise<AssetProductCodes>;
  end: (id: string, validTo: string, reason: string, now?: string) => Promise<AssetProductCodes>;
  edit: (
    id: string,
    input: EditAssetProductCodes,
    reason: string,
    now?: string,
  ) => Promise<AssetProductCodes>;
  remove: (id: string, reason: string, now?: string) => Promise<string>;
  resolve: (tagId: string, rawValue: string, at: string) => Promise<string | null>;
};

type AssetProductCodesServiceDeps = {
  assetProductCodesStore: AssetProductCodesStore;
  assetTagsStore: AssetTagsStore;
  assetPlacementsStore: AssetPlacementsStore;
  productsReaderRepository: ProductsReader;
};

function nowIso(): string {
  return new Date().toISOString();
}

/** UTC ISO, so stored timestamps compare as text and read the same everywhere. */
function utc(iso: string): string {
  return new Date(iso).toISOString();
}

/**
 * PRD-003 US-FND-WMS-006 — product codes per machine (F-04 §9.7). A row in
 * force is never overwritten (rule 5): an Edit ends it and opens a new row in
 * one save (PO 2026-10-04); only a row that has not started yet is changed in
 * place, or deleted.
 */
class AssetProductCodesService implements TAssetProductCodesService {
  private store: AssetProductCodesStore;
  private assetTagsStore: AssetTagsStore;
  private placements: AssetPlacementsStore;
  private products: ProductsReader;

  constructor({
    assetProductCodesStore,
    assetTagsStore,
    assetPlacementsStore,
    productsReaderRepository,
  }: AssetProductCodesServiceDeps) {
    this.store = assetProductCodesStore;
    this.assetTagsStore = assetTagsStore;
    this.placements = assetPlacementsStore;
    this.products = productsReaderRepository;
  }

  async getPaged(
    page: number,
    size: number,
    filter: AssetProductCodesFilter,
  ): Promise<PagedAssetProductCodesResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.store.paginate({
      limit,
      offset,
      tagId: filter.tagId,
      productId: filter.productId,
    });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string): Promise<AssetProductCodes> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "asset-product-codes not found" });
    return row;
  }

  async create(input: CreateAssetProductCodes): Promise<AssetProductCodes> {
    // WMS-006 rule 4 (`wms-007.error.required` / `.error.order`).
    const invalid = checkCodeInput(input);
    if (invalid) throw refusal(422, invalid);
    const tag = await this.assetTagsStore.get(input.tagId);
    if (!tag) throw new HTTPException(404, { message: "tag not found" });
    // WMS-006 rule 3: only product_code tags carry codes.
    if (tag.tagRole !== "product_code") throw refusal(422, "not_product_code_tag");
    if (!(await this.products.getProduct(input.productId))) {
      throw new HTTPException(404, { message: "product not found" });
    }
    const candidate = {
      ...input,
      validFrom: utc(input.validFrom),
      validTo: input.validTo ? utc(input.validTo) : null,
    };
    await this.assertNoOverlap({ ...candidate, assetId: tag.assetId });
    const created = await this.store.create(candidate);
    await this.recordChange(created, "add", null, created, nowIso());
    return created;
  }

  /**
   * WMS-006 `wms-007.end`: end an active or scheduled row at `validTo`.
   * Rule 9 / AC-12: a reason is required (`wms-007.error.reason`); nothing is
   * written without one. The reason goes to AUDIT_LOG with the change.
   */
  async end(
    id: string,
    validTo: string,
    reason: string,
    now: string = nowIso(),
  ): Promise<AssetProductCodes> {
    if (reason.trim() === "") throw refusal(422, "reason_required");
    const row = await this.get(id);
    if (codeStatus(row, now) === "ended") throw refusal(422, "already_ended");
    const invalid = checkCodeInput({ ...row, validTo });
    if (invalid) throw refusal(422, invalid);
    const end = utc(validTo);
    // Ending later than the row's own end would widen it — check it again.
    if (row.validTo === null || end > row.validTo) {
      const tag = await this.assetTagsStore.get(row.tagId);
      if (tag)
        await this.assertNoOverlap({
          ...row,
          validTo: end,
          assetId: tag.assetId,
          excludeId: row.id,
        });
    }
    const before = { ...row }; // the store may update `row` in place
    const ended = await this.store.end(id, end);
    await this.recordChange(before, "end", before, { ...before, validTo: end }, now);
    return ended ?? row;
  }

  /**
   * WMS-006 rule 5 / AC-6, AC-7b (PO 2026-10-04, F-00 "Editing an
   * effective-dated row"): one save ends the row at `effectiveFrom` and opens
   * a new one from there with the edited values, keeping the old end. One
   * ASSET_PRODUCT_CODE_CHANGE row, `action = edit`, names the new row; its old
   * period is the row as it was. A scheduled row never applied: changed in
   * place, same id. Back-dating is allowed — the screen warns first.
   */
  async edit(
    id: string,
    input: EditAssetProductCodes,
    reason: string,
    now: string = nowIso(),
  ): Promise<AssetProductCodes> {
    if (reason.trim() === "") throw refusal(422, "reason_required");
    const row = await this.get(id);
    const status = codeStatus(row, now);
    if (status === "ended") throw refusal(422, "already_ended");
    const validTo = input.validTo === undefined ? row.validTo : input.validTo;
    const from = input.effectiveFrom;
    const invalid = checkCodeInput({ rawValue: input.rawValue, validFrom: from, validTo });
    if (invalid) throw refusal(422, invalid);
    const next = {
      rawValue: input.rawValue,
      validFrom: utc(from),
      validTo: validTo ? utc(validTo) : null,
    };
    const tag = await this.assetTagsStore.get(row.tagId);
    if (!tag) throw new HTTPException(404, { message: "tag not found" });
    const before = { ...row }; // the store may update `row` in place

    if (status === "scheduled") {
      await this.assertNoOverlap({ ...next, assetId: tag.assetId, excludeId: row.id });
      const changed = (await this.store.replaceScheduled(id, next)) ?? { ...row, ...next };
      await this.recordChange(changed, "edit", before, changed, now);
      return changed;
    }

    // An active row: the new version starts inside it, never before it.
    if (new Date(next.validFrom).getTime() <= new Date(row.validFrom).getTime()) {
      throw refusal(422, "edit_before_start", { validFrom: row.validFrom });
    }
    if (
      row.validTo !== null &&
      new Date(next.validFrom).getTime() >= new Date(row.validTo).getTime()
    ) {
      throw refusal(422, "edit_after_end", { validTo: row.validTo });
    }
    await this.assertNoOverlap({ ...next, assetId: tag.assetId, excludeId: row.id });
    await this.store.end(id, next.validFrom);
    const created = await this.store.create({
      tagId: row.tagId,
      productId: row.productId,
      ...next,
    });
    await this.recordChange(created, "edit", before, created, now);
    return created;
  }

  /**
   * WMS-006 rule 5 / `wms-007.delete-scheduled`: only a row whose start is
   * still in the future. Rule 9: Delete needs a reason, like End.
   */
  async remove(id: string, reason: string, now: string = nowIso()): Promise<string> {
    if (reason.trim() === "") throw refusal(422, "reason_required");
    const row = await this.get(id);
    if (codeStatus(row, now) !== "scheduled") throw refusal(422, "not_scheduled");
    await this.store.remove(id);
    await this.recordChange(row, "delete", row, null, now);
    return id;
  }

  /** WMS-006 §4 / F-07.1: the product a reading of `tagId` with `rawValue` at `at` means; null = unmapped. */
  async resolve(tagId: string, rawValue: string, at: string): Promise<string | null> {
    const tag = await this.assetTagsStore.get(tagId);
    if (!tag) throw new HTTPException(404, { message: "tag not found" });
    return resolveProduct(await this.rowsWithAsset(), tag.assetId, rawValue, at);
  }

  /**
   * F-04 §9.7 ASSET_PRODUCT_CODE_CHANGE (docs-molcadx#95): one row per add,
   * End or Delete with the exact old and new period, after the mapping write
   * and in the same request transaction.
   */
  private async recordChange(
    row: AssetProductCodes,
    action: AssetProductCodeChange["action"],
    before: AssetProductCodes | null,
    after: AssetProductCodes | null,
    at: string,
  ): Promise<void> {
    await this.store.recordChange({
      assetProductCodeId: row.id,
      workUnitId: await this.workUnitOf(row.tagId),
      rawValue: row.rawValue,
      action,
      oldValidFrom: before?.validFrom ?? null,
      oldValidTo: before?.validTo ?? null,
      newValidFrom: after?.validFrom ?? null,
      newValidTo: after?.validTo ?? null,
      changedAt: utc(at),
    });
  }

  /**
   * Where the code's tag counts, as the address does (DSR-001 rules 12/13):
   * the tag's own lane first, else the machine's only active placement. Null
   * when the machine is on no work unit, or on several and the tag has no lane.
   */
  private async workUnitOf(tagId: string): Promise<string | null> {
    const tag = await this.assetTagsStore.get(tagId);
    if (!tag) return null;
    if (tag.workUnitId) return tag.workUnitId;
    const active = (await this.placements.byAsset(tag.assetId)).filter((p) => p.validTo === null);
    return active.length === 1 ? active[0]!.workUnitId : null;
  }

  private async rowsWithAsset(): Promise<Array<AssetCodeRow>> {
    const rows = await this.store.all();
    const tagged = await Promise.all(
      rows.map(async (r) => {
        const tag = await this.assetTagsStore.get(r.tagId);
        return tag ? [{ ...r, assetId: tag.assetId }] : [];
      }),
    );
    return tagged.flat();
  }

  /** WMS-006 rule 1 (A-6b) — `wms-007.error.overlap` names the other product and its start. */
  private async assertNoOverlap(candidate: {
    assetId: string;
    rawValue: string;
    validFrom: string;
    validTo: string | null;
    excludeId?: string;
  }) {
    const other = findOverlap(candidate, await this.rowsWithAsset());
    if (other) {
      throw refusal(409, "overlap", {
        rawValue: other.rawValue,
        assetId: other.assetId,
        productId: other.productId,
        validFrom: other.validFrom,
      });
    }
  }
}

export { AssetProductCodesService };
export type {
  TAssetProductCodesService,
  AssetProductCodesServiceDeps,
  PagedAssetProductCodesResult,
};
