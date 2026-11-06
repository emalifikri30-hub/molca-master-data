import { describe, it, expect, vi } from "vite-plus/test";

import { createHealthHandler } from "./health-handler.js";

import type { DependencyState, Probe } from "./health-service.js";

function probe(state: DependencyState): Probe & { execute: ReturnType<typeof vi.fn> } {
  return { execute: vi.fn().mockResolvedValue(state) };
}

describe("GET /liveness", () => {
  it("returns 200 without touching the probes", async () => {
    const keycloakProbe = probe({ ok: true });
    const postgresProbe = probe({ ok: true });
    const app = createHealthHandler({ keycloakProbe, postgresProbe });

    const res = await app.request("/liveness");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(keycloakProbe.execute).not.toHaveBeenCalled();
    expect(postgresProbe.execute).not.toHaveBeenCalled();
  });
});

describe("GET /readiness", () => {
  it("returns 200 and ok when all dependencies are healthy", async () => {
    const app = createHealthHandler({
      keycloakProbe: probe({ ok: true }),
      postgresProbe: probe({ ok: true }),
    });

    const res = await app.request("/readiness");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.dependencies).toEqual({ keycloak: { ok: true }, postgres: { ok: true } });
  });

  it("returns 503 and degraded when a dependency is down", async () => {
    const app = createHealthHandler({
      keycloakProbe: probe({ ok: true }),
      postgresProbe: probe({ ok: false, error: "conn refused" }),
    });

    const res = await app.request("/readiness");
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.dependencies.postgres).toEqual({ ok: false, error: "conn refused" });
  });

  it("caches the snapshot within the TTL and refreshes after it expires", async () => {
    let clock = 1_000;
    const keycloakProbe = probe({ ok: true });
    const postgresProbe = probe({ ok: true });
    const app = createHealthHandler({
      keycloakProbe,
      postgresProbe,
      cacheTtlMs: 5_000,
      now: () => clock,
    });

    await app.request("/readiness");
    await app.request("/readiness");
    expect(keycloakProbe.execute).toHaveBeenCalledTimes(1);
    expect(postgresProbe.execute).toHaveBeenCalledTimes(1);

    clock = 7_000; // past expiresAt (1000 + 5000)
    await app.request("/readiness");
    expect(keycloakProbe.execute).toHaveBeenCalledTimes(2);
    expect(postgresProbe.execute).toHaveBeenCalledTimes(2);
  });
});
