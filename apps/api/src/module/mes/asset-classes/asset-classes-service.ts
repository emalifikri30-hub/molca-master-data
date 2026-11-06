import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import type {
  AssetClasses,
  AssetClassesFilter,
  CreateAssetClasses,
  DeactivateAssetClasses,
  UpdateAssetClasses,
} from "./asset-classes.js";
import type { AssetClassesStore } from "./asset-classes-store.js";
import type { AssetTypesStore } from "../asset-types/asset-types-store.js";

type PagedAssetClassesResult = PagedResult<AssetClasses>;

type TAssetClassesService = {
  getPaged: (
    page: number,
    size: number,
    filter: AssetClassesFilter,
  ) => Promise<PagedAssetClassesResult>;
  get: (id: string) => Promise<AssetClasses>;
  create: (input: CreateAssetClasses) => Promise<AssetClasses>;
  update: (id: string, patch: UpdateAssetClasses) => Promise<AssetClasses>;
  deactivate: (id: string, input: DeactivateAssetClasses) => Promise<AssetClasses>;
};

type AssetClassesServiceDeps = {
  assetClassesStore: AssetClassesStore;
  assetTypesStore: AssetTypesStore;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

class AssetClassesService implements TAssetClassesService {
  private store: AssetClassesStore;
  private typesStore: AssetTypesStore;

  constructor({ assetClassesStore, assetTypesStore }: AssetClassesServiceDeps) {
    this.store = assetClassesStore;
    this.typesStore = assetTypesStore;
  }

  async getPaged(
    page: number,
    size: number,
    filter: AssetClassesFilter,
  ): Promise<PagedAssetClassesResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.store.paginate({ limit, offset, q: filter.q });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string): Promise<AssetClasses> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "asset-classes not found" });
    return row;
  }

  /** PRD-003 US-FND-AST-001 rule 1 / AC-2: codes are unique per tenant (active rows). */
  private async assertCodeFree(code: string, selfId?: string): Promise<void> {
    const holder = await this.store.findByCode(code, selfId);
    if (holder) {
      throw new HTTPException(409, {
        message: `Code "${code}" is already used by asset class "${holder.name}".`,
      });
    }
  }

  async create(input: CreateAssetClasses): Promise<AssetClasses> {
    await this.assertCodeFree(input.code);
    return this.store.create(input, today());
  }

  async update(id: string, patch: UpdateAssetClasses): Promise<AssetClasses> {
    if (!(await this.store.get(id)))
      throw new HTTPException(404, { message: "asset-classes not found" });
    if (patch.code !== undefined) await this.assertCodeFree(patch.code, id);
    if (patch.parentClassId === id) {
      throw new HTTPException(422, { message: "A class can't be its own parent." });
    }
    const row = await this.store.update(id, patch);
    if (!row) throw new HTTPException(404, { message: "asset-classes not found" });
    return row;
  }

  /**
   * PRD-003 US-FND-AST-001 rule 3 / AC-4: never deleted, only deactivated.
   * Rejected while the class still has active types (naming them) or active
   * child classes (edge case: children are deactivated first).
   */
  async deactivate(id: string, input: DeactivateAssetClasses): Promise<AssetClasses> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "asset-classes not found" });
    if (row.validTo !== null) {
      throw new HTTPException(422, { message: `Asset class "${row.name}" is already inactive.` });
    }
    const activeTypes = await this.typesStore.activeByClass(id);
    if (activeTypes.length > 0) {
      const names = activeTypes.map((t) => t.name).join(", ");
      throw new HTTPException(409, {
        message: `Asset class "${row.name}" still has active types: ${names}. Deactivate them first.`,
      });
    }
    const children = await this.store.activeChildren(id);
    if (children.length > 0) {
      const names = children.map((c) => c.name).join(", ");
      throw new HTTPException(409, {
        message: `Asset class "${row.name}" still has active sub-classes: ${names}. Deactivate them first.`,
      });
    }
    const updated = await this.store.update(id, { validTo: input.validTo ?? today() });
    if (!updated) throw new HTTPException(404, { message: "asset-classes not found" });
    return updated;
  }
}

export { AssetClassesService };
export type { TAssetClassesService, AssetClassesServiceDeps, PagedAssetClassesResult };
