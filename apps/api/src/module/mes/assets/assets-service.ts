import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import { refusal } from "../../../shared/errors/refusal.js";
import { noTransaction, type Transact } from "../../../shared/database/transaction.js";
import { assertNoFloorTagClash } from "../asset-placements/floor-tag-clash.js";

import { COMPONENT_LEVEL_VALUES } from "../../../shared/database/schema/value-lists.js";

import type { Assets, AssetsFilter, ComponentLevel, CreateAssets, UpdateAssets } from "./assets.js";
import type { AssetsStore } from "./assets-store.js";
import type { AssetPlacementsStore } from "../asset-placements/asset-placements-store.js";
import type { AssetTagsStore } from "../asset-tags/asset-tags-store.js";

type PagedAssetsResult = PagedResult<Assets>;

type TAssetsService = {
  getPaged: (page: number, size: number, filter: AssetsFilter) => Promise<PagedAssetsResult>;
  get: (id: string) => Promise<Assets>;
  create: (input: CreateAssets) => Promise<Assets>;
  update: (id: string, patch: UpdateAssets) => Promise<Assets>;
};

type AssetsServiceDeps = {
  assetsStore: AssetsStore;
  /** For the floor-tag segment clash (AST-002 rule 8); absent in unit tests that don't place. */
  assetPlacementsStore?: AssetPlacementsStore;
  /** For AST-002 rule 5: a deactivated machine ends its still-open floor tags. */
  assetTagsStore?: AssetTagsStore;
  /** Commits the deactivation and the tag ends together (absent = no transaction). */
  transact?: Transact;
};

/** AST-002: the four layers, top (0) to deepest (3). */
const COMPONENT_LABEL: Record<ComponentLevel, string> = {
  equipment_unit: "Equipment unit",
  subunit: "Subunit",
  maintainable_item: "Maintainable item",
  part: "Part",
};

/** "an Equipment unit", "a Subunit" — the label with its article, for messages. */
function aLabel(level: ComponentLevel): string {
  const label = COMPONENT_LABEL[level];
  return `${/^[AEIOU]/.test(label) ? "an" : "a"} ${label}`;
}

function depthOf(level: ComponentLevel): number {
  return COMPONENT_LEVEL_VALUES.indexOf(level);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

class AssetsService implements TAssetsService {
  private store: AssetsStore;
  private placements?: AssetPlacementsStore;
  private tags?: AssetTagsStore;
  private transact: Transact;

  constructor(deps: AssetsServiceDeps) {
    this.store = deps.assetsStore;
    this.placements = deps.assetPlacementsStore;
    this.tags = deps.assetTagsStore;
    this.transact = deps.transact ?? noTransaction;
  }

  async getPaged(page: number, size: number, filter: AssetsFilter): Promise<PagedAssetsResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.store.paginate({ limit, offset, q: filter.q });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string): Promise<Assets> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "assets not found" });
    return row;
  }

  /**
   * F-04 §9.5 / US-FND-AST-002 AC-4: Part is the last ISO 14224 layer — a
   * `part`-level asset can never be given a child. AST-002: component depth is
   * locked at 4 layers, so only an Equipment unit may stand alone and every
   * child must sit strictly deeper than its parent. Also refuses a parent that
   * is the asset itself or one of its own descendants (would form a loop).
   */
  private async assertCanBeParent(
    parentAssetId: string,
    child: { assetTag: string; componentLevel: ComponentLevel },
    selfId?: string,
  ): Promise<void> {
    if (!parentAssetId) {
      if (child.componentLevel !== "equipment_unit") {
        throw new HTTPException(422, {
          message: `${child.assetTag} is ${aLabel(child.componentLevel)} — only an Equipment unit can stand on its own. Pick its parent.`,
        });
      }
      return;
    }
    const parent = await this.store.get(parentAssetId);
    if (!parent) throw new HTTPException(404, { message: "parent asset not found" });
    if (parent.componentLevel === "part") {
      throw new HTTPException(422, {
        message: `${parent.assetTag} is a Part — the last ISO 14224 layer. Nothing can nest under it.`,
      });
    }
    if (depthOf(child.componentLevel) <= depthOf(parent.componentLevel)) {
      throw new HTTPException(422, {
        message: `${child.assetTag} is ${aLabel(child.componentLevel)} — it can't sit under ${parent.assetTag}, ${aLabel(parent.componentLevel)}. Layers run Equipment unit → Subunit → Maintainable item → Part.`,
      });
    }
    if (selfId) {
      let cursor: Assets | undefined = parent;
      while (cursor) {
        if (cursor.id === selfId) {
          throw new HTTPException(422, {
            message: "An asset can't sit under itself or one of its own components.",
          });
        }
        cursor = cursor.parentAssetId ? await this.store.get(cursor.parentAssetId) : undefined;
      }
    }
  }

  /**
   * US-FND-AST-002 rule 1 / AC-2, AC-15: no two active machines of the tenant
   * hold the same floor tag, placed or not. A machine that is decommissioned
   * but not yet closed (valid_to empty) still holds its tag.
   */
  private async assertTagFree(assetTag: string, selfId?: string): Promise<void> {
    const holder = await this.store.findActiveByAssetTag(assetTag, selfId);
    if (!holder) return;
    throw refusal(409, "asset_tag_taken", {
      holderTag: holder.assetTag,
      holderAssetId: holder.id,
      holderName: holder.assetName || holder.assetTag,
    });
  }

  async create(input: CreateAssets): Promise<Assets> {
    await this.assertCanBeParent(input.parentAssetId, input);
    await this.assertTagFree(input.assetTag);
    const date = today();
    // Rule 5: never deleted — a decommissioned record is closed with valid_to.
    const validTo = input.lifecycleStatus === "decommissioned" ? date : null;
    return this.store.create(input, date, validTo);
  }

  async update(id: string, patch: UpdateAssets): Promise<Assets> {
    const current = await this.store.get(id);
    if (!current) throw new HTTPException(404, { message: "assets not found" });
    // US-FND-AST-002 rule 1: checked only when the tag is edited, never on placement.
    if (patch.assetTag !== undefined && patch.assetTag !== current.assetTag) {
      await this.assertTagFree(patch.assetTag, id);
    }
    if (patch.parentAssetId !== undefined || patch.componentLevel !== undefined) {
      await this.assertCanBeParent(
        patch.parentAssetId ?? current.parentAssetId,
        {
          assetTag: patch.assetTag ?? current.assetTag,
          componentLevel: patch.componentLevel ?? current.componentLevel,
        },
        id,
      );
    }
    // AST-002: a level change may not leave a component at or above its parent's new level.
    const nextLevel = patch.componentLevel;
    if (nextLevel !== undefined && nextLevel !== current.componentLevel) {
      const children = await this.store.childrenOf(id);
      const clash = children.find((c) => depthOf(c.componentLevel) <= depthOf(nextLevel));
      if (clash) {
        throw new HTTPException(422, {
          message: `${current.assetTag} has components at ${COMPONENT_LABEL[clash.componentLevel]} level — it must stay above them.`,
        });
      }
    }
    // AST-002 rule 8 / AC-11: a floor-tag change may not make two machines
    // on one work unit clean to the same address segment. The tag itself is
    // kept as typed — never refused for its characters (A-13, 2026-10-02).
    if (this.placements && patch.assetTag !== undefined && patch.assetTag !== current.assetTag) {
      const own = (await this.placements.byAsset(id)).filter((p) => p.validTo === null);
      await assertNoFloorTagClash(
        { placements: this.placements, assets: this.store },
        { id, assetTag: patch.assetTag },
        own.map((p) => p.workUnitId),
      );
    }
    // Decommissioning = `decommissioned` + `valid_to` (US-FND-AST-002 rule 5).
    const closing: { validTo?: string } =
      patch.lifecycleStatus === "decommissioned" && current.validTo === null
        ? { validTo: today() }
        : {};
    // US-FND-AST-002 rule 5: the machine's still-open tags end with the same
    // date, in the same save. Tags already ended keep their own date.
    return this.transact(async () => {
      const row = await this.store.update(id, { ...patch, ...closing });
      if (!row) throw new HTTPException(404, { message: "assets not found" });
      if (closing.validTo !== undefined && this.tags) {
        await this.tags.endOpenByAsset(id, closing.validTo);
      }
      return row;
    });
  }
}

export { AssetsService };
export type { TAssetsService, AssetsServiceDeps, PagedAssetsResult };
