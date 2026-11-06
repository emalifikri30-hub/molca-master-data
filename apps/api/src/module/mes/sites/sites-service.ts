import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import { assertCodeAvailable, isActiveRow } from "../site-hierarchy/hierarchy-rules.js";

import type { CreateSites, Sites, SitesFilter, UpdateSites } from "./sites.js";
import type { SitesReader, SitesWriter } from "./sites-repository.js";

type PagedSitesResult = PagedResult<Sites>;

type TSitesService = {
  getPaged: (page: number, size: number, filter: SitesFilter) => Promise<PagedSitesResult>;
  get: (id: string) => Promise<Sites>;
  create: (input: CreateSites) => Promise<Sites>;
  update: (id: string, patch: UpdateSites) => Promise<Sites>;
};

type SitesServiceDeps = {
  sitesReaderRepository: SitesReader;
  sitesWriterRepository: SitesWriter;
};

class SitesService implements TSitesService {
  private reader: SitesReader;
  private writer: SitesWriter;

  constructor({ sitesReaderRepository, sitesWriterRepository }: SitesServiceDeps) {
    this.reader = sitesReaderRepository;
    this.writer = sitesWriterRepository;
  }

  async getPaged(page: number, size: number, filter: SitesFilter): Promise<PagedSitesResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.reader.paginate({ limit, offset, q: filter.q });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string): Promise<Sites> {
    const row = await this.reader.get(id);
    if (!row) throw new HTTPException(404, { message: "sites not found" });
    return row;
  }

  async create(input: CreateSites): Promise<Sites> {
    await this.assertCodeAvailable(input.enterpriseId, input.code);
    return this.writer.create(input);
  }

  async update(id: string, patch: UpdateSites): Promise<Sites> {
    const current = await this.reader.get(id);
    if (!current) throw new HTTPException(404, { message: "sites not found" });
    await this.assertCodeAvailable(
      patch.enterpriseId ?? current.enterpriseId,
      patch.code ?? current.code,
      id,
    );
    const row = await this.writer.update(id, patch);
    if (!row) throw new HTTPException(404, { message: "sites not found" });
    return row;
  }

  /**
   * PRD-003 SIT-001 rule 2: a site code is unique among the active sites of its
   * enterprise (PO, 2026-10-21). Retired sites are left out of the code check
   * only; the segment clash still counts every sibling.
   */
  private async assertCodeAvailable(
    enterpriseId: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const siblings = await this.reader.listByEnterprise(enterpriseId);
    assertCodeAvailable(
      siblings.filter((r) => isActiveRow(r)),
      code,
      excludeId,
      siblings,
    );
  }
}

export { SitesService };
export type { TSitesService, SitesServiceDeps, PagedSitesResult };
