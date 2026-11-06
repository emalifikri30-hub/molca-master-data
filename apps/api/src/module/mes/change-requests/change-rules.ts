// Which Master Data changes are sensitive (PRD Workflow & approval, "Master Data change approval"). Pure: a
// request (method, path, body) → the change it is, or null when it may go through at once.

type Sensitive = { entity: string; entityId: string; action: string };

const CATALOG = ["items", "stores", "bins", "failure-codes"];

/**
 * Retiring an asset (lifecycle → decommissioned), deactivating a catalogue record or a hierarchy node, and a
 * manual revaluation of an item's cost need a second person. Everything else applies at once.
 */
function sensitive(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
): Sensitive | null {
  const p = path.replace(/^\/api\/v1/, "").replace(/\/$/, "");
  const seg = p.split("/").filter(Boolean);
  if (
    method === "PUT" &&
    seg[0] === "assets" &&
    seg.length === 2 &&
    body?.lifecycleStatus === "decommissioned"
  )
    return { entity: "asset", entityId: seg[1]!, action: "decommission" };
  if (method === "POST" && CATALOG.includes(seg[0]!) && seg.length === 3 && seg[2] === "deactivate")
    return { entity: seg[0]!, entityId: seg[1]!, action: "deactivate" };
  if (method === "POST" && seg[0] === "items" && seg[2] === "costs" && body?.source === "manual")
    return { entity: "items", entityId: seg[1]!, action: "revalue" };
  if (method === "POST" && seg[0] === "site-hierarchy" && seg[1] === "deactivate")
    return {
      entity: String(body?.kind ?? "node"),
      entityId: String(body?.id ?? ""),
      action: "deactivate",
    };
  return null;
}

/** Approvers of Master Data changes: the maintenance manager and the plant admin (roles from the MAM client). */
const APPROVER_ROLES = ["maintenance-manager", "tenant-admin"];

export { APPROVER_ROLES, sensitive };
export type { Sensitive };
