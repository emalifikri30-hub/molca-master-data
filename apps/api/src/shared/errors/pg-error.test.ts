import { describe, expect, it } from "vite-plus/test";

import { mapPgError } from "./pg-error.js";

function wrapped(code: string, constraint: string) {
  const pg = Object.assign(new Error("db"), { code, constraint });
  return Object.assign(new Error("Failed query: insert …"), { cause: pg });
}

describe("mapPgError", () => {
  it("maps a unique violation to 409 already_exists", async () => {
    const res = mapPgError(wrapped("23505", "routing_flow_wc_version_key"))!.getResponse();
    expect(res.status).toBe(409);
    expect(await res.text()).toBe(
      'REFUSAL:{"code":"already_exists","constraint":"routing_flow_wc_version_key"}',
    );
  });

  it("maps an exclusion violation to 409 overlaps_existing", async () => {
    const res = mapPgError(wrapped("23P01", "site_shift_no_overlap"))!.getResponse();
    expect(res.status).toBe(409);
    expect(await res.text()).toContain('"code":"overlaps_existing"');
  });

  it("names a tenant code or name clash the way dx-platform reads it (TNT-G15)", async () => {
    const code = mapPgError(wrapped("23505", "tenant_code_key"))!.getResponse();
    expect(code.status).toBe(409);
    expect(await code.text()).toBe('REFUSAL:{"code":"code_taken"}');
    const name = mapPgError(wrapped("23505", "tenant_name_key"))!.getResponse();
    expect(await name.text()).toBe('REFUSAL:{"code":"name_taken"}');
  });

  it("finds the Postgres error under a transaction's extra wrapper", () => {
    const outer = Object.assign(new Error("tx"), { cause: wrapped("23505", "k") });
    expect(mapPgError(outer)?.status).toBe(409);
  });

  it("leaves other errors to the 500 handler", () => {
    expect(mapPgError(wrapped("23503", "fk"))).toBeNull();
    expect(mapPgError(new Error("boom"))).toBeNull();
  });
});
