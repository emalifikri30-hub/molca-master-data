import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test";
import { setupServer } from "msw/node";
import { http, HttpResponse, delay } from "msw";
import { HTTPException } from "hono/http-exception";

import { runInTenant } from "../../shared/tenant/tenant-context.js";
import { PlanningClient } from "./planning-client.js";
import { PlanningError, planningUnreachable } from "./planning-error.js";
import fixture from "./fixtures/executions.json" with { type: "json" };

const BASE = "http://planning.test";
const EXECUTIONS = `${BASE}/api/v1/job-orders/executions`;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client(timeoutMs = 5_000) {
  return new PlanningClient({ planningBaseUrl: BASE, planningTimeoutMs: timeoutMs });
}

// Records each inbound Authorization header so the bearer rules are asserted on the wire.
function record(responder: () => Response | Promise<Response>) {
  const auth: Array<string | null> = [];
  server.use(
    http.get(EXECUTIONS, async ({ request }) => {
      auth.push(request.headers.get("authorization"));
      return responder();
    }),
  );
  return { calls: () => auth.length, auth };
}

async function caught(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work();
  } catch (err) {
    return err;
  }
  return undefined;
}

describe("PlanningClient (dx-production-planning /executions)", () => {
  it("forwards the caller's bearer so Planning scopes to the same tenant (F-00 rule 6)", async () => {
    const seen = record(() => HttpResponse.json(fixture));

    await runInTenant({ tenantId: "org-a", bearer: "user-token" }, () => client().executions());

    expect(seen.auth).toEqual(["Bearer user-token"]);
  });

  it("sends no authorization header when no bearer is in context", async () => {
    const seen = record(() => HttpResponse.json(fixture));

    await runInTenant({ tenantId: "org-a" }, () => client().executions());

    expect(seen.auth).toEqual([null]);
  });

  it("joins each execution to its Job Order and returns typed rows", async () => {
    record(() => HttpResponse.json(fixture));

    const payload = await client().executions();

    expect(payload.workOrders).toEqual([
      {
        id: "wo-1",
        woNumber: "WO-2026-00184",
        productId: "prod-3",
        siteId: "site-1",
        status: "in_progress",
        priority: 2,
      },
    ]);
    expect(payload.jobOrders[0]).toMatchObject({
      id: "jo-1",
      operationId: "op-step-10",
      workUnitId: "wu-1",
      status: "in_progress",
    });
    expect(payload.executions[0]).toMatchObject({
      id: "ex-1",
      workOrderId: "wo-1",
      operationId: "op-step-10",
      workUnitId: "wu-1",
      goodQty: 480,
      reworkQty: null,
      status: "in_progress",
    });
    expect(payload.executions[0]).not.toHaveProperty("jobOrderId");
  });

  it("accepts empty arrays", async () => {
    record(() =>
      HttpResponse.json({
        data: { workOrders: [], jobOrders: [], executions: [] },
        error: null,
      }),
    );

    await expect(client().executions()).resolves.toEqual({
      workOrders: [],
      jobOrders: [],
      executions: [],
    });
  });

  it("maps an execution with no Job Order to parse_error", async () => {
    record(() =>
      HttpResponse.json({
        data: {
          workOrders: [],
          jobOrders: [],
          executions: [
            {
              id: "ex-9",
              jobOrderId: "jo-missing",
              workUnitId: "wu-1",
              shiftInstanceId: "shift-1",
              goodQty: 1,
              scrapQty: 0,
              reworkQty: 0,
              actualStart: null,
              actualEnd: null,
              status: "completed",
            },
          ],
        },
        error: null,
      }),
    );

    const err = await caught(() => client().executions());

    expect((err as PlanningError).errorCause).toBe("parse_error");
  });

  it("maps a timeout to PlanningError timeout", async () => {
    record(async () => {
      await delay(200);
      return HttpResponse.json(fixture);
    });

    const err = await caught(() => client(20).executions());

    expect(err).toBeInstanceOf(PlanningError);
    expect((err as PlanningError).errorCause).toBe("timeout");
  });

  it("maps a refused connection to PlanningError network_error", async () => {
    record(() => HttpResponse.error());

    const err = await caught(() => client().executions());

    expect((err as PlanningError).errorCause).toBe("network_error");
  });

  it("carries the status on a 5xx as http_error", async () => {
    record(() => HttpResponse.json({ data: null, error: "boom" }, { status: 500 }));

    const err = await caught(() => client().executions());

    expect(err).toMatchObject({ errorCause: "http_error", status: 500 });
  });

  it("does not retry a 401: the user's token must surface, not be re-minted", async () => {
    const seen = record(() =>
      HttpResponse.json({ data: null, error: "unauthorized" }, { status: 401 }),
    );

    const err = await caught(() => client().executions());

    expect(err).toMatchObject({ errorCause: "http_error", status: 401 });
    expect(seen.calls()).toBe(1);
  });

  it("maps a body that is not JSON to parse_error", async () => {
    record(() => HttpResponse.text("<html>gateway</html>", { status: 200 }));

    const err = await caught(() => client().executions());

    expect((err as PlanningError).errorCause).toBe("parse_error");
  });

  it("maps a shape drift (a required field missing) to parse_error", async () => {
    record(() =>
      HttpResponse.json({
        data: {
          workOrders: [{ id: "wo-1", woNumber: "WO-1", productId: "p", status: "released" }],
          jobOrders: [],
          executions: [],
        },
        error: null,
      }),
    );

    const err = await caught(() => client().executions());

    expect((err as PlanningError).errorCause).toBe("parse_error");
  });

  it("maps a 200 with null data to parse_error, not an empty answer", async () => {
    record(() => HttpResponse.json({ data: null, error: null }));

    const err = await caught(() => client().executions());

    expect((err as PlanningError).errorCause).toBe("parse_error");
  });
});

describe("planningUnreachable", () => {
  it("maps every planning failure to the refusal planning_unreachable (503)", () => {
    const mapped = planningUnreachable(
      new PlanningError({ cause: "timeout", operation: "executions", message: "slow" }),
    );

    expect(mapped).toBeInstanceOf(HTTPException);
    expect(mapped.status).toBe(503);
    expect(mapped.message).toBe('REFUSAL:{"code":"planning_unreachable"}');
  });
});

describe("breaks", () => {
  it("reads the site's effective-dated SHIFT_BREAK rows (K-28)", async () => {
    server.use(
      http.get(`${BASE}/api/v1/breaktime/all`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("siteId") !== "site-1") {
          return HttpResponse.json({ data: [], error: null });
        }
        return HttpResponse.json({
          data: [
            {
              id: "brk-1",
              siteId: "site-1",
              enterpriseShiftId: "shift-1",
              workUnitId: null,
              startTime: "11:30",
              endTime: "12:00",
              label: "Lunch",
              effectiveFrom: "2026-01-01T00:00:00.000Z",
              effectiveTo: null,
            },
          ],
          error: null,
        });
      }),
    );
    const rows = await client().breaks("site-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ startTime: "11:30", workUnitId: null });
  });

  it("maps a refused connection to PlanningError network_error", async () => {
    server.use(http.get(`${BASE}/api/v1/breaktime/all`, () => HttpResponse.error()));
    const err = await client()
      .breaks("site-1")
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(PlanningError);
    expect((err as PlanningError).errorCause).toBe("network_error");
  });
});
