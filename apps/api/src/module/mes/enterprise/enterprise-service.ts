import { refusal } from "../../../shared/errors/refusal.js";
import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import type {
  CreateEnterprise,
  Enterprise,
  EnterpriseFilter,
  UpdateEnterprise,
} from "./enterprise.js";
import type { EnterpriseStore } from "./enterprise-store.js";

type PagedEnterpriseResult = PagedResult<Enterprise>;

type TEnterpriseService = {
  getPaged: (
    page: number,
    size: number,
    filter: EnterpriseFilter,
  ) => Promise<PagedEnterpriseResult>;
  get: (id: string) => Promise<Enterprise>;
  create: (input: CreateEnterprise) => Promise<Enterprise>;
  update: (id: string, patch: UpdateEnterprise) => Promise<Enterprise>;
  deactivate: (id: string) => Promise<Enterprise>;
};

type EnterpriseServiceDeps = {
  enterpriseStore: EnterpriseStore;
};

class EnterpriseService implements TEnterpriseService {
  private store: EnterpriseStore;

  constructor({ enterpriseStore }: EnterpriseServiceDeps) {
    this.store = enterpriseStore;
  }

  async getPaged(
    page: number,
    size: number,
    _filter: EnterpriseFilter,
  ): Promise<PagedEnterpriseResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.store.paginate({ limit, offset });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string): Promise<Enterprise> {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "enterprise not found" });
    return row;
  }

  create(input: CreateEnterprise): Promise<Enterprise> {
    return this.store.create(input);
  }

  async update(id: string, patch: UpdateEnterprise): Promise<Enterprise> {
    const row = await this.store.update(id, patch);
    if (!row) throw new HTTPException(404, { message: "enterprise not found" });
    return row;
  }

  /** F-00 / F-14: never hard-deleted — deactivation sets valid_to (today). */
  async deactivate(id: string): Promise<Enterprise> {
    const current = await this.store.get(id);
    if (!current) throw new HTTPException(404, { message: "enterprise not found" });
    if (current.validTo != null) throw refusal(422, "already_inactive", { id });
    const row = await this.store.deactivate(id, new Date().toISOString().slice(0, 10));
    if (!row) throw new HTTPException(404, { message: "enterprise not found" });
    return row;
  }
}

export { EnterpriseService };
export type { TEnterpriseService, EnterpriseServiceDeps, PagedEnterpriseResult };
