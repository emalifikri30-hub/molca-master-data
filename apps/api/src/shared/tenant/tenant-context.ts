// Source of the copies in the other dx-* APIs (apps/api/src/shared/tenant/tenant-context.ts):
// keep the copies in step.
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The tenant one request works in (F-00 rule 6, E-2). `tenantId` is the Keycloak
 * organization id from the login token; `bearer` is the caller's token, when it sent one.
 */
type TenantContext = { tenantId: string; bearer?: string };

const store = new AsyncLocalStorage<TenantContext>();

/**
 * Runs `work` inside one tenant. Repositories filter every read, update and delete by
 * `context.tenantId` and stamp it on every insert, so nothing crosses tenants.
 */
function runInTenant<T>(context: TenantContext, work: () => T): T {
  return store.run(context, work);
}

/** The tenant of the current request, or undefined outside one (seed, tests, login). */
function currentTenant(): TenantContext | undefined {
  return store.getStore();
}

/**
 * The tenant id a repository filters and stamps by. Outside a tenant it throws, so a
 * query with no tenant fails closed instead of reading every tenant's rows (F-00 rule 6).
 */
function currentTenantId(): string {
  const context = store.getStore();
  if (!context) throw new Error("no tenant in context");
  return context.tenantId;
}

/** The caller's bearer token, for calls from this request to other MolcaDx modules. */
function currentBearer(): string | undefined {
  return store.getStore()?.bearer;
}

export { currentBearer, currentTenant, currentTenantId, runInTenant };
export type { TenantContext };
