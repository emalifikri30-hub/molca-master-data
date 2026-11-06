import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import type { CreateCrew, Crew, UpdateCrew } from "./crews.js";
import type { CrewsStore } from "./crews-store.js";

type TCrewsService = {
  getPaged: (page: number, size: number, q?: string) => Promise<PagedResult<Crew>>;
  get: (id: string) => Promise<Crew>;
  create: (input: CreateCrew) => Promise<Crew>;
  update: (id: string, patch: UpdateCrew) => Promise<Crew>;
  deactivate: (id: string, validTo?: string) => Promise<Crew>;
};

const today = () => new Date().toISOString().slice(0, 10);

class CrewsService implements TCrewsService {
  private store: CrewsStore;

  constructor({ crewsStore }: { crewsStore: CrewsStore }) {
    this.store = crewsStore;
  }

  async getPaged(page: number, size: number, q?: string) {
    const { items, totalElements } = await this.store.paginate({
      limit: size,
      offset: (page - 1) * size,
      q,
    });
    return { items, meta: buildPageMeta(page, size, totalElements) };
  }

  async get(id: string) {
    const row = await this.store.get(id);
    if (!row) throw new HTTPException(404, { message: "crew not found" });
    return row;
  }

  async create(input: CreateCrew) {
    if (await this.store.findByCode(input.code))
      throw new HTTPException(409, { message: `Code ${input.code} is already used.` });
    return this.store.create(input, today());
  }

  async update(id: string, patch: UpdateCrew) {
    await this.get(id);
    if (patch.code && (await this.store.findByCode(patch.code, id)))
      throw new HTTPException(409, { message: `Code ${patch.code} is already used.` });
    return (await this.store.update(id, patch))!;
  }

  /** Never deleted: assignments made to a crew keep their name. */
  async deactivate(id: string, validTo?: string) {
    const row = await this.get(id);
    if (row.validTo) throw new HTTPException(422, { message: `${row.name} is already inactive.` });
    return (await this.store.update(id, { validTo: validTo ?? today() }))!;
  }
}

export { CrewsService };
export type { TCrewsService };
