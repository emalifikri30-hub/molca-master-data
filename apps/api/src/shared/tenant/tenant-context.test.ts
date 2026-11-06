import { describe, expect, it } from "vite-plus/test";

import { currentBearer, currentTenant, currentTenantId, runInTenant } from "./tenant-context.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("tenant context (F-00 rule 6)", () => {
  it("fails closed outside a tenant", () => {
    expect(() => currentTenantId()).toThrow("no tenant in context");
    expect(currentTenant()).toBeUndefined();
    expect(currentBearer()).toBeUndefined();
  });

  it("returns the tenant of the work it runs", async () => {
    const seen = await runInTenant({ tenantId: "org-a", bearer: "tok-a" }, async () => {
      await wait(1);
      return [currentTenantId(), currentBearer()];
    });
    expect(seen).toEqual(["org-a", "tok-a"]);
  });

  it("keeps two concurrent tenants apart", async () => {
    const readAfterWait = (tenantId: string) =>
      runInTenant({ tenantId }, async () => {
        await wait(tenantId === "org-a" ? 5 : 1);
        return currentTenantId();
      });
    const seen = await Promise.all([readAfterWait("org-a"), readAfterWait("org-b")]);
    expect(seen).toEqual(["org-a", "org-b"]);
  });

  it("gives a nested run its own tenant and restores the outer one", async () => {
    await runInTenant({ tenantId: "org-a" }, async () => {
      await runInTenant({ tenantId: "org-b" }, async () => {
        expect(currentTenantId()).toBe("org-b");
      });
      expect(currentTenantId()).toBe("org-a");
    });
  });
});
