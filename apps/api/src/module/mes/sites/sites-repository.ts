import { eq } from "drizzle-orm";
import { ulid } from "ulidx";

import { EntityRepository } from "../../../shared/database/entity-repository.js";
import { siteTable } from "../../../shared/database/schema/schema.js";

import type { PostgresDB } from "../../../shared/database/postgres.js";
import type { CreateSites, Sites, UpdateSites } from "./sites.js";

const SITE_KEYS = ["id", "classId", "enterpriseId", "code", "name", "timezone"];

type PaginateSitesInput = {
  limit: number;
  offset: number;
  q?: string;
};

type SitesReader = {
  paginate(input: PaginateSitesInput): Promise<{ items: Sites[]; totalElements: number }>;
  listByEnterprise(enterpriseId: string): Promise<Sites[]>;
  get(id: string): Promise<Sites | undefined>;
};

type SitesWriter = {
  create(input: CreateSites): Promise<Sites>;
  update(id: string, patch: UpdateSites): Promise<Sites | undefined>;
};

type SitesRepositoryDeps = {
  db: PostgresDB;
  region: string;
};

class SitesReaderRepository implements SitesReader {
  private repo: EntityRepository<Sites>;

  constructor({ db, region }: SitesRepositoryDeps) {
    this.repo = new EntityRepository({ db, region }, siteTable as never, SITE_KEYS);
  }

  paginate(input: PaginateSitesInput): Promise<{ items: Sites[]; totalElements: number }> {
    return this.repo.paginate(input, ["code", "name"]);
  }

  listByEnterprise(enterpriseId: string): Promise<Sites[]> {
    return this.repo.list(eq(siteTable.enterpriseId, enterpriseId));
  }

  get(id: string): Promise<Sites | undefined> {
    return this.repo.get(id);
  }
}

class SitesWriterRepository implements SitesWriter {
  private repo: EntityRepository<Sites>;

  constructor({ db, region }: SitesRepositoryDeps) {
    this.repo = new EntityRepository({ db, region }, siteTable as never, SITE_KEYS);
  }

  async create(input: CreateSites): Promise<Sites> {
    const row: Sites = {
      id: ulid(),
      enterpriseId: input.enterpriseId,
      code: input.code,
      name: input.name,
      classId: input.classId ?? "",
      timezone: input.timezone,
    };
    await this.repo.insert(row);
    return row;
  }

  update(id: string, patch: UpdateSites): Promise<Sites | undefined> {
    return this.repo.update(id, patch);
  }
}

export { SitesReaderRepository, SitesWriterRepository };
export type { SitesReader, SitesWriter, PaginateSitesInput };
