import { HTTPException } from "hono/http-exception";

import { buildPageMeta, type PagedResult } from "@molca/network";

import type { CreatePerson, Person, UpdatePerson } from "./people.js";
import type { PeopleStore } from "./people-store.js";

type TPeopleService = {
  getPaged: (page: number, size: number, q?: string) => Promise<PagedResult<Person>>;
  get: (id: string) => Promise<Person>;
  create: (input: CreatePerson) => Promise<Person>;
  update: (id: string, patch: UpdatePerson) => Promise<Person>;
  deactivate: (id: string, validTo?: string) => Promise<Person>;
};

const today = () => new Date().toISOString().slice(0, 10);

class PeopleService implements TPeopleService {
  private store: PeopleStore;

  constructor({ peopleStore }: { peopleStore: PeopleStore }) {
    this.store = peopleStore;
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
    if (!row) throw new HTTPException(404, { message: "person not found" });
    return row;
  }

  async create(input: CreatePerson) {
    if (await this.store.findByCode(input.code))
      throw new HTTPException(409, { message: `Code ${input.code} is already used.` });
    return this.store.create(input, today());
  }

  async update(id: string, patch: UpdatePerson) {
    await this.get(id);
    if (patch.code && (await this.store.findByCode(patch.code, id)))
      throw new HTTPException(409, { message: `Code ${patch.code} is already used.` });
    return (await this.store.update(id, patch))!;
  }

  /** Never deleted: labour booked against a person keeps their name and rate. */
  async deactivate(id: string, validTo?: string) {
    const row = await this.get(id);
    if (row.validTo) throw new HTTPException(422, { message: `${row.name} is already inactive.` });
    return (await this.store.update(id, { validTo: validTo ?? today() }))!;
  }
}

export { PeopleService };
export type { TPeopleService };
