import { ulid } from "ulidx";

import { refusal } from "../../../shared/errors/refusal.js";
import { sameCode } from "../../../shared/util/code-match.js";
import { CODE_PATTERN, isActiveRow } from "../site-hierarchy/hierarchy-rules.js";

import type { ClassLevel, LocationClass } from "./location-classes.js";
import type { LocationClassesStore } from "./location-classes-store.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type LocationClassesServiceDeps = { locationClassesStore: LocationClassesStore };

class LocationClassesService {
  private store: LocationClassesStore;

  constructor({ locationClassesStore }: LocationClassesServiceDeps) {
    this.store = locationClassesStore;
  }

  list(level: ClassLevel): Promise<LocationClass[]> {
    return this.store.list(level);
  }

  /** Rule 1: code and name required, codes follow F-00 and are unique per level. */
  async save(input: {
    id?: string;
    level: ClassLevel;
    code: string;
    name: string;
  }): Promise<LocationClass> {
    const code = input.code.trim();
    if (!CODE_PATTERN.test(code)) throw refusal(422, "code_chars");
    const rows = await this.store.list(input.level);
    // SIT-004 rule 1 / AC-7 (PO 2026-10-21): a retired class frees its code.
    // docs-molcadx#142: codes match ignoring case and surrounding spaces.
    const holder = rows.find((c) => isActiveRow(c) && sameCode(c.code, code) && c.id !== input.id);
    if (holder) throw refusal(409, "code_taken", { holderCode: holder.code, name: holder.name });
    if (input.id) {
      const row = await this.store.get(input.id);
      if (!row || row.level !== input.level) throw refusal(404, "not_found");
      const updated = await this.store.update(input.id, input.level, {
        code,
        name: input.name.trim(),
      });
      if (!updated) throw refusal(404, "not_found");
      return updated;
    }
    const row: LocationClass = {
      id: ulid(),
      level: input.level,
      code,
      name: input.name.trim(),
      validFrom: today(),
      validTo: null,
    };
    return this.store.insert(row);
  }

  /** Rule 5: never deleted — retiring sets the end date. */
  async deactivate(id: string): Promise<LocationClass> {
    const row = await this.store.get(id);
    if (!row) throw refusal(404, "not_found");
    const updated = await this.store.update(id, row.level, { validTo: today() });
    if (!updated) throw refusal(404, "not_found");
    return updated;
  }

  /** Reactivating clears the end date — the mirror of deactivate. */
  async reactivate(id: string): Promise<LocationClass> {
    const row = await this.store.get(id);
    if (!row) throw refusal(404, "not_found");
    if (row.validTo === null) {
      throw refusal(409, "already_active", { value: row.code, name: row.name });
    }
    const updated = await this.store.update(id, row.level, { validTo: null });
    if (!updated) throw refusal(404, "not_found");
    return updated;
  }
}

export { LocationClassesService };
export type { LocationClassesService as TLocationClassesService, LocationClassesServiceDeps };
