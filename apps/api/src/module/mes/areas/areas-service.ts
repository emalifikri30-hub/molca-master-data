import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import { assertCodeAvailable, isActiveRow } from "../site-hierarchy/hierarchy-rules.js";

import type { Areas, AreasFilter, CreateAreas, UpdateAreas } from "./areas.js";
import type { AreasReader, AreasWriter } from "./areas-repository.js";

type PagedAreasResult = PagedResult<Areas>;

type TAreasService = {
  getPaged: (page: number, size: number, filter: AreasFilter) => Promise<PagedAreasResult>;
  get: (id: string) => Promise<Areas>;
  create: (input: CreateAreas) => Promise<Areas>;
  update: (id: string, patch: UpdateAreas) => Promise<Areas>;
};

type AreasServiceDeps = {
  areasReaderRepository: AreasReader;
  areasWriterRepository: AreasWriter;
};

class AreasService implements TAreasService {
  private reader: AreasReader;
  private writer: AreasWriter;

  constructor({ areasReaderRepository, areasWriterRepository }: AreasServiceDeps) {
    this.reader = areasReaderRepository;
    this.writer = areasWriterRepository;
  }

  async getPaged(page: number, size: number, filter: AreasFilter): Promise<PagedAreasResult> {
    const limit = size;
    const offset = (page - 1) * limit;
    const { items, totalElements } = await this.reader.paginate({ limit, offset, q: filter.q });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string): Promise<Areas> {
    const row = await this.reader.get(id);
    if (!row) throw new HTTPException(404, { message: "areas not found" });
    return row;
  }

  async create(input: CreateAreas): Promise<Areas> {
    await this.assertCodeAvailable(input.siteId, input.code);
    return this.writer.create(input);
  }

  async update(id: string, patch: UpdateAreas): Promise<Areas> {
    const current = await this.reader.get(id);
    if (!current) throw new HTTPException(404, { message: "areas not found" });
    await this.assertCodeAvailable(patch.siteId ?? current.siteId, patch.code ?? current.code, id);
    const row = await this.writer.update(id, patch);
    if (!row) throw new HTTPException(404, { message: "areas not found" });
    return row;
  }

  /**
   * PRD-003 SIT-001 rule 2: an area code is unique among the active areas of its
   * site (PO, 2026-10-21). Retired areas are left out of the code check only;
   * the segment clash still counts every sibling.
   */
  private async assertCodeAvailable(
    siteId: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const siblings = await this.reader.listBySite(siteId);
    assertCodeAvailable(
      siblings.filter((r) => isActiveRow(r)),
      code,
      excludeId,
      siblings,
    );
  }
}

export { AreasService };
export type { TAreasService, AreasServiceDeps, PagedAreasResult };
