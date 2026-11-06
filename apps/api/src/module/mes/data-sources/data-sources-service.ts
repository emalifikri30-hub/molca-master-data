import { ulid } from "ulidx";

import { refusal } from "../../../shared/errors/refusal.js";

import { cleanSegment } from "../asset-tags/generated-address.js";
import { maskConfig, mergeConfig } from "./connection-secrets.js";

import type { DataSource } from "./data-sources.js";
import type { DataSourcesStore } from "./data-sources-store.js";
import type { AssetTagsStore } from "../asset-tags/asset-tags-store.js";
import type { SitesStore } from "../sites/sites-store.js";

type DataSourcesServiceDeps = {
  dataSourcesStore: DataSourcesStore;
  assetTagsStore: AssetTagsStore;
  sitesStore: SitesStore;
};

/** DSR-001 rule 16: what an edit may change. `protocol` and the site never change. */
type DataSourcePatch = Partial<
  Pick<DataSource, "name" | "nodeNaming" | "namespaceUri" | "topicRoot" | "connectionConfig">
> & {
  /** Present only to be refused: another protocol is a new data source. */
  protocol?: DataSource["protocol"];
  /** DSR-001 rule 14 / AC-15: the user confirmed "This changes <count> tag addresses." */
  confirmAddressChange?: boolean;
};

/**
 * DSR-001 AC-6 / rule 2: credentials are never displayed, in any form. Since
 * 2026-10-02 (PO, F-13 §9.1) the endpoint part of the settings is not secret
 * and is returned in clear; every other key keeps its name and loses its value.
 */
function withoutSecrets(row: DataSource): DataSource {
  return { ...row, connectionConfig: maskConfig(row.connectionConfig) as Record<string, string> };
}

class DataSourcesService {
  private store: DataSourcesStore;
  private assetTagsStore: AssetTagsStore;
  private sitesStore: SitesStore;

  constructor({ dataSourcesStore, assetTagsStore, sitesStore }: DataSourcesServiceDeps) {
    this.store = dataSourcesStore;
    this.assetTagsStore = assetTagsStore;
    this.sitesStore = sitesStore;
  }

  async list(): Promise<DataSource[]> {
    const rows = await this.store.list();
    return [...rows].sort((a, b) => a.name.localeCompare(b.name)).map(withoutSecrets);
  }

  /**
   * F-13 §9.1: a new source names its site (required, never changed). A
   * generated OPC UA source with no namespace URI gets the site default
   * `urn:molca:<cleaned site code>` (PO 2026-10-02, prd-molcadx#24 item 4).
   */
  async create(input: Omit<DataSource, "id" | "validTo">): Promise<DataSource> {
    const site = input.siteId ? await this.sitesStore.get(input.siteId) : undefined;
    if (!site) throw refusal(422, "site_not_found", { siteId: input.siteId });
    const namespaceUri =
      input.protocol === "opcua" && input.nodeNaming === "generated" && input.namespaceUri === ""
        ? `urn:molca:${cleanSegment(site.code)}`
        : input.namespaceUri;
    const row: DataSource = { ...input, namespaceUri, id: ulid(), validTo: null };
    return withoutSecrets(await this.store.insert(row));
  }

  /**
   * DSR-001 rule 16 (PO 2026-10-02, F-13 §9.1 "Editing a data source"): the
   * connection is edited in place — a new IP, a rotated password, a new name
   * keep its id, its tags and their readings. `protocol` never changes (it
   * decides what the settings hold). A credential left empty keeps the stored
   * one. Changing naming, namespace or topic root on a source with active
   * tags changes their addresses: refused until the user confirms the count
   * (rule 14, AC-15). The endpoint alone changes no address.
   */
  async update(id: string, patch: DataSourcePatch): Promise<DataSource> {
    const row = await this.store.get(id);
    if (!row) throw refusal(404, "not_found");
    if (patch.protocol !== undefined && patch.protocol !== row.protocol) {
      throw refusal(409, "protocol_locked");
    }
    const next: DataSource = {
      ...row,
      name: patch.name ?? row.name,
      nodeNaming: patch.nodeNaming ?? row.nodeNaming,
      namespaceUri: patch.namespaceUri ?? row.namespaceUri,
      topicRoot: patch.topicRoot ?? row.topicRoot,
      connectionConfig:
        patch.connectionConfig === undefined
          ? row.connectionConfig
          : mergeConfig(row.connectionConfig, patch.connectionConfig),
    };
    const addressesMove =
      next.nodeNaming !== row.nodeNaming ||
      next.namespaceUri !== row.namespaceUri ||
      next.topicRoot !== row.topicRoot;
    if (addressesMove && !patch.confirmAddressChange) {
      const count = await this.activeTagCount(id);
      if (count > 0) throw refusal(409, "address_change", { count });
    }
    const updated = await this.store.update(id, {
      name: next.name,
      nodeNaming: next.nodeNaming,
      namespaceUri: next.namespaceUri,
      topicRoot: next.topicRoot,
      connectionConfig: next.connectionConfig,
    });
    if (!updated) throw refusal(404, "not_found");
    return withoutSecrets(updated);
  }

  /** Active tags on the source — each has an address that a naming change moves. */
  private async activeTagCount(dataSourceId: string): Promise<number> {
    const { items } = await this.assetTagsStore.paginate({
      limit: Number.MAX_SAFE_INTEGER,
      offset: 0,
    });
    return items.filter((t) => t.dataSourceId === dataSourceId && t.validTo === null).length;
  }

  /** Never deleted: deactivation sets validTo. */
  async deactivate(id: string, validTo: string): Promise<DataSource> {
    const row = await this.store.get(id);
    if (!row) throw refusal(404, "not_found");
    const updated = await this.store.update(id, { validTo });
    if (!updated) throw refusal(404, "not_found");
    return withoutSecrets(updated);
  }
}

export { DataSourcesService };
export type { DataSourcesService as TDataSourcesService, DataSourcesServiceDeps, DataSourcePatch };
