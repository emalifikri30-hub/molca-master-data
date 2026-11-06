import { describe, it, expect, vi } from "vite-plus/test";

import { KeycloakProbe, PostgresProbe } from "./health-service.js";

import type { PostgresDB } from "../../shared/database/postgres.js";

const OIDC_BASE = "http://keycloak.test/realms/test";
const JWKS_URL = `${OIDC_BASE}/protocol/openid-connect/certs`;

function fetchReturning(impl: () => Response | Promise<Response>) {
  return vi.fn(() => Promise.resolve(impl())) as unknown as typeof fetch;
}

describe("KeycloakProbe", () => {
  it("reports ok and hits the JWKS endpoint when the response is 2xx", async () => {
    const fetchImpl = fetchReturning(() => new Response(null, { status: 200 }));
    const probe = new KeycloakProbe({ oidcBase: OIDC_BASE, fetchImpl });

    expect(await probe.execute()).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      JWKS_URL,
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("reports the status code when the response is not ok", async () => {
    const fetchImpl = fetchReturning(() => new Response(null, { status: 503 }));
    const probe = new KeycloakProbe({ oidcBase: OIDC_BASE, fetchImpl });

    expect(await probe.execute()).toEqual({ ok: false, error: "keycloak_jwks returned 503" });
  });

  it("reports the error message when fetch throws", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.reject(new Error("network down")),
    ) as unknown as typeof fetch;
    const probe = new KeycloakProbe({ oidcBase: OIDC_BASE, fetchImpl });

    expect(await probe.execute()).toEqual({ ok: false, error: "network down" });
  });
});

describe("PostgresProbe", () => {
  it("reports ok when SELECT 1 resolves", async () => {
    const db = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as PostgresDB;
    const probe = new PostgresProbe({ db });

    expect(await probe.execute()).toEqual({ ok: true });
  });

  it("reports the error message when the query rejects", async () => {
    const db = {
      execute: vi.fn().mockRejectedValue(new Error("conn refused")),
    } as unknown as PostgresDB;
    const probe = new PostgresProbe({ db });

    expect(await probe.execute()).toEqual({ ok: false, error: "conn refused" });
  });

  it("reports a timeout when the query hangs past the deadline", async () => {
    const db = { execute: vi.fn(() => new Promise(() => {})) } as unknown as PostgresDB;
    const probe = new PostgresProbe({ db, probeTimeoutMs: 10 });

    expect(await probe.execute()).toEqual({ ok: false, error: "postgres probe timed out" });
  });
});
