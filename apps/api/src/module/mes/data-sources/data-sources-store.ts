import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import { dataSourceTable } from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type { DataSource } from "./data-sources.js";

const KEYS = [
  "id",
  "siteId",
  "name",
  "protocol",
  "nodeNaming",
  "namespaceUri",
  "topicRoot",
  "connectionConfig",
  "validFrom",
  "validTo",
];

class DataSourcesStore {
  private repo?: EntityRepository<DataSource>;
  items: DataSource[] = [
    {
      id: "ds-1",
      siteId: "site-1",
      name: "Line 3 PLC",
      protocol: "opcua",
      // Seeds the demo's typed nodes (PLC1.DB10.DBW4, …): a source that
      // existed before node_naming keeps its addresses — `generated` is the
      // default for a *new* source (DSR-001 rule 7). New sources created in
      // the UI start on "Build from location".
      nodeNaming: "manual",
      namespaceUri: "",
      topicRoot: "",
      connectionConfig: { endpoint: "opc.tcp://10.0.3.10:4840", namespace: "2" },
      validFrom: "2024-01-01",
      validTo: null,
    },
  ];

  constructor(deps?: DbDeps) {
    this.repo = openRepo<DataSource>(deps, dataSourceTable, KEYS);
  }

  async list(): Promise<DataSource[]> {
    if (this.repo) return this.repo.list();
    return this.items;
  }

  async get(id: string): Promise<DataSource | undefined> {
    if (this.repo) return this.repo.get(id);
    return this.items.find((d) => d.id === id);
  }

  async insert(row: DataSource): Promise<DataSource> {
    if (this.repo) return this.repo.insert(row);
    this.items.push(row);
    return row;
  }

  async update(id: string, patch: Partial<DataSource>): Promise<DataSource | undefined> {
    if (this.repo) return this.repo.update(id, patch);
    const row = this.items.find((d) => d.id === id);
    if (!row) return undefined;
    Object.assign(row, patch);
    return row;
  }
}

export { DataSourcesStore };
