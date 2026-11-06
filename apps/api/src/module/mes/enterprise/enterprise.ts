// FOUNDATION F-01 §9.2 `ENTERPRISE` — top of the ISA-95 tree. Real entity,
// not a synthetic UI root: SITE.enterprise_id is a required FK into this
// table. `tenant_id` (§9.2's FK -> TENANT, the product's ownership boundary
// above ISA-95) is not modeled anywhere in this repo yet — omitted here
// rather than invented, same treatment as ASSET.owner_org_unit_id's dropped
// ORG_UNIT FK elsewhere in FOUNDATION.
type Enterprise = {
  id: string;
  code: string;
  name: string;
  validFrom: string;
  /** null = still active. Deactivate, never hard-delete (§00 shared rule) — no deactivate UX built yet, same gap as Site/Area/Work Center/Work Unit. */
  validTo: string | null;
};

type CreateEnterprise = {
  code: string;
  name: string;
  validFrom: string;
};

type UpdateEnterprise = Partial<CreateEnterprise> & { validTo?: string | null };

type EnterpriseFilter = Record<string, never>;

export type { Enterprise, CreateEnterprise, UpdateEnterprise, EnterpriseFilter };
