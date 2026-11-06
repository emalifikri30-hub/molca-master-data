import { and, eq, gt, isNull, lte, or } from "drizzle-orm";

import { tenantTable } from "../database/schema/schema.js";

import type { PostgresDB } from "../database/postgres.js";

/** A tenant as a request sees it: the TENANT columns it needs (F-01 §9.1). */
type Tenant = { tenantId: string; tenantCode: string; tenantName: string };

/** The tenant with this id, only when it is in force on `today` (YYYY-MM-DD), else undefined. */
type FindTenant = (tenantId: string, today: string) => Promise<Tenant | undefined>;

/**
 * Reads the TENANT table directly, not through EntityRepository: the tenant registry
 * is not itself tenant-scoped. In force on a day when valid_from <= day and
 * (valid_to is null or valid_to > day), the same exclusive end as
 * module/mes/work-master/work-master-rules.ts. A deactivated tenant is never deleted.
 */
function createFindTenant(db: PostgresDB): FindTenant {
  return async (tenantId, today) => {
    const [row] = await db
      .select({
        tenantId: tenantTable.tenantId,
        tenantCode: tenantTable.tenantCode,
        tenantName: tenantTable.tenantName,
      })
      .from(tenantTable)
      .where(
        and(
          eq(tenantTable.tenantId, tenantId),
          lte(tenantTable.validFrom, today),
          or(isNull(tenantTable.validTo), gt(tenantTable.validTo, today)),
        ),
      )
      .limit(1);
    return row;
  };
}

export { createFindTenant };
export type { FindTenant, Tenant };
