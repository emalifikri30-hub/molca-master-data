import { Hono } from "hono";

import type { DependencyState, Probe } from "./health-service.js";

type HealthHandlerDeps = {
  keycloakProbe: Probe;
  postgresProbe: Probe;
  // Overrides for tests.
  cacheTtlMs?: number;
  now?: () => number;
};

type ReadinessSnapshot = {
  expiresAt: number;
  ok: boolean;
  dependencies: Record<string, DependencyState>;
};

const DEFAULT_CACHE_TTL_MS = 5_000;

function createHealthHandler({ keycloakProbe, postgresProbe, cacheTtlMs, now }: HealthHandlerDeps) {
  const app = new Hono();

  const ttl = cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const clock = now ?? (() => Date.now());
  let snapshot: ReadinessSnapshot | null = null;
  let inflight: Promise<ReadinessSnapshot> | null = null;

  async function refresh(current: number): Promise<ReadinessSnapshot> {
    const [keycloak, postgres] = await Promise.all([
      keycloakProbe.execute(),
      postgresProbe.execute(),
    ]);
    return {
      expiresAt: current + ttl,
      ok: postgres.ok && keycloak.ok,
      dependencies: { keycloak, postgres },
    };
  }

  app.get("/liveness", (c) => {
    return c.json(
      {
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      200,
    );
  });

  app.get("/readiness", async (c) => {
    const current = clock();

    let snap = snapshot;
    if (!snap || snap.expiresAt <= current) {
      inflight ??= refresh(current).then((s) => {
        snapshot = s;
        inflight = null;
        return s;
      });
      snap = await inflight;
    }

    return c.json(
      {
        status: snap.ok ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        dependencies: snap.dependencies,
      },
      snap.ok ? 200 : 503,
    );
  });

  return app;
}

export { createHealthHandler };
export type { HealthHandlerDeps };
