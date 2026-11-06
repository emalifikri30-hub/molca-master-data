import type { HTTPException } from "hono/http-exception";

import { refusal } from "./refusal.js";

/** The Postgres error drizzle wraps as `cause` (node-postgres `DatabaseError`). */
type PgError = { code?: string; constraint?: string };

function pgCause(err: unknown): PgError | null {
  let current: unknown = err;
  // DrizzleQueryError → cause; a transaction can wrap it once more.
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const candidate = current as PgError & { cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate;
    }
    current = candidate.cause;
  }
  return null;
}

/**
 * Keys whose clash has its own refusal code, the one the caller already knows
 * (dx-platform cross-repo contract §0: `code_taken` / `name_taken`, TNT-G15).
 */
const NAMED_KEYS: Record<string, string> = {
  tenant_code_key: "code_taken",
  tenant_name_key: "name_taken",
};

/**
 * A database key or no-overlap constraint caught a write that the app checks
 * let through (two saves at the same moment). That is the caller's conflict,
 * not a server fault: 409, naming the constraint, instead of 500.
 * - 23505 unique_violation    → `already_exists` (or the key's own code in NAMED_KEYS)
 * - 23P01 exclusion_violation → `overlaps_existing` (the `*_no_overlap` constraints)
 */
function mapPgError(err: unknown): HTTPException | null {
  const pg = pgCause(err);
  if (!pg) return null;
  const constraint = pg.constraint ?? "";
  if (pg.code === "23505") {
    const named = NAMED_KEYS[constraint];
    if (named) return refusal(409, named);
    return refusal(409, "already_exists", { constraint });
  }
  if (pg.code === "23P01") return refusal(409, "overlaps_existing", { constraint });
  return null;
}

export { mapPgError };
