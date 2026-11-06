import { eq } from "drizzle-orm";
import { ulid } from "ulidx";

import { EntityRepository } from "../../../shared/database/entity-repository.js";
import { areaTable } from "../../../shared/database/schema/schema.js";

import type { PostgresDB } from "../../../shared/database/postgres.js";
import type { Areas, CreateAreas, UpdateAreas } from "./areas.js";

const AREA_KEYS = ["id", "classId", "validTo", "code", "name", "siteId"];

type PaginateAreasInput = {
  limit: number;
  offset: number;
  q?: string;
};

type AreasReader = {
  paginate(input: PaginateAreasInput): Promise<{ items: Areas[]; totalElements: number }>;
  listBySite(siteId: string): Promise<Areas[]>;
  get(id: string): Promise<Areas | undefined>;
};

type AreasWriter = {
  create(input: CreateAreas): Promise<Areas>;
  update(id: string, patch: UpdateAreas): Promise<Areas | undefined>;
};

type AreasRepositoryDeps = {
  db: PostgresDB;
  region: string;
};

class AreasReaderRepository implements AreasReader {
  private repo: EntityRepository<Areas>;

  constructor({ db, region }: AreasRepositoryDeps) {
    this.repo = new EntityRepository({ db, region }, areaTable as never, AREA_KEYS);
  }

  paginate(input: PaginateAreasInput): Promise<{ items: Areas[]; totalElements: number }> {
    return this.repo.paginate(input, ["code", "name"]);
  }

  listBySite(siteId: string): Promise<Areas[]> {
    return this.repo.list(eq(areaTable.siteId, siteId));
  }

  get(id: string): Promise<Areas | undefined> {
    return this.repo.get(id);
  }
}

class AreasWriterRepository implements AreasWriter {
  private repo: EntityRepository<Areas>;

  constructor({ db, region }: AreasRepositoryDeps) {
    this.repo = new EntityRepository({ db, region }, areaTable as never, AREA_KEYS);
  }

  async create(input: CreateAreas): Promise<Areas> {
    const row: Areas = {
      id: ulid(),
      code: input.code,
      name: input.name,
      classId: input.classId ?? "",
      siteId: input.siteId,
      validTo: null,
    };
    await this.repo.insert(row);
    return row;
  }

  update(id: string, patch: UpdateAreas): Promise<Areas | undefined> {
    return this.repo.update(id, patch);
  }
}

export { AreasReaderRepository, AreasWriterRepository };
export type { AreasReader, AreasWriter, PaginateAreasInput };
