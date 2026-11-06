import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import type {
  AssetTypes,
  AssetTypesFilter,
  CreateAssetTypes,
  DeactivateAssetTypes,
  UpdateAssetTypes,
} from "./asset-types.js";
import type { AssetTypesStore } from "./asset-types-store.js";
import type { AssetsStore } from "../assets/assets-store.js";

type PagedAssetTypesResult = PagedResult<AssetTypes>;

type TAssetTypesService = {
  getPaged: (
    page: number,
    size: number,
    filter: AssetTypesFilter,
  ) => Promise<PagedAssetTypesResult>;
  get: (id: string) => Promise<AssetTypes>;
  create: (input: CreateAssetTypes) => Promise<AssetTypes>;
  update: (id: string, patch: UpdateAssetTypes) => Promise<AssetTypes>;
  deactivate: (id: string, input: DeactivateAssetTypes) => Promise<AssetTypes>;
};

type AssetTypesServiceDeps = {
  assetTypesStore: AssetTypesStore;
  assetsStore: AssetsStore;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

class AssetTypesService implements TAssetTypesService {
  private store: AssetTypesStore;
  private assetsStore: AssetsStore;

  constructor({ assetTypesStore, assetsStore }: AssetTypesServiceDeps) {
    this.store = assetTypesStore;
    this.assetsStore = assetsStore;
  }

  async getPaged(
    page: number,
    size: number,
    filter: AssetTypesFilter,
  ): Promise<PagedAssetTypesResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.store.paginate({ limit, offset, q: filter.q });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string): Promise<AssetTypes> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "asset-types not found" });
    return row;
  }

  /** PRD-003 US-FND-AST-001 rule 1 / AC-2: codes are unique per tenant (active rows). */
  private async assertCodeFree(code: string, selfId?: string): Promise<void> {
    const holder = await this.store.findByCode(code, selfId);
    if (holder) {
      throw new HTTPException(409, {
        message: `Code "${code}" is already used by asset type "${holder.name}".`,
      });
    }
  }

  async create(input: CreateAssetTypes): Promise<AssetTypes> {
    await this.assertCodeFree(input.code);
    return this.store.create(input, today());
  }

  async update(id: string, patch: UpdateAssetTypes): Promise<AssetTypes> {
    if (!(await this.store.get(id)))
      throw new HTTPException(404, { message: "asset-types not found" });
    if (patch.code !== undefined) await this.assertCodeFree(patch.code, id);
    const row = await this.store.update(id, patch);
    if (!row) throw new HTTPException(404, { message: "asset-types not found" });
    return row;
  }

  /**
   * Never deleted, only deactivated (PRD-003 US-FND-AST-001 rule 3).
   * Rejected while machines whose record hasn't ended (`validTo IS NULL`,
   * the same set `assets_per_type` counts) still use the type — naming them.
   */
  async deactivate(id: string, input: DeactivateAssetTypes): Promise<AssetTypes> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "asset-types not found" });
    if (row.validTo !== null) {
      throw new HTTPException(422, { message: `Asset type "${row.name}" is already inactive.` });
    }
    const inUse = await this.assetsStore.activeByType(id);
    if (inUse.length > 0) {
      const tags = inUse.map((a) => a.assetTag).join(", ");
      throw new HTTPException(409, {
        message: `Asset type "${row.name}" is still used by active assets: ${tags}.`,
      });
    }
    const updated = await this.store.update(id, { validTo: input.validTo ?? today() });
    if (!updated) throw new HTTPException(404, { message: "asset-types not found" });
    return updated;
  }
}

export { AssetTypesService };
export type { TAssetTypesService, AssetTypesServiceDeps, PagedAssetTypesResult };
