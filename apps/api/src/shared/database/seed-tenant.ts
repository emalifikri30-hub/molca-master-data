// The tenant a seed run writes into (F-00 rule 6, E-2). The tenant id is the
// Keycloak organization id, so a seeded tenant can sign in and see its rows.
// Every master-data row a seed inserts carries this tenant_id, and every
// delete or update in a seed is limited to it.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { tenantTable } from "./schema/schema.js";

type SeedTenant = { tenantId: string; tenantCode: string; tenantName: string };

/**
 * Reads the seed tenant from the environment. `SEED_TENANT_ID` is required and is
 * the Keycloak organization id; code and name default to MOLCA / Molca.
 */
function seedTenantFromEnv(env: NodeJS.ProcessEnv = process.env): SeedTenant {
  const tenantId = env.SEED_TENANT_ID?.trim();
  if (!tenantId) {
    throw new Error(
      "SEED_TENANT_ID is required: set it to the Keycloak organization id of the tenant to seed (F-00 rule 6).",
    );
  }
  return {
    tenantId,
    // Stored upper-case (TNT-G15, check tenant_code_upper).
    tenantCode: (env.SEED_TENANT_CODE?.trim() || "MOLCA").toUpperCase(),
    tenantName: env.SEED_TENANT_NAME?.trim() || "Molca",
  };
}

/** Upserts the TENANT row the seed rows point at. Existing rows are left as they are. */
async function ensureTenant(db: Pick<NodePgDatabase, "insert">, tenant: SeedTenant): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await db
    .insert(tenantTable)
    .values({ ...tenant, validFrom: today })
    .onConflictDoNothing({ target: tenantTable.tenantId });
}

export { ensureTenant, seedTenantFromEnv };
export type { SeedTenant };
