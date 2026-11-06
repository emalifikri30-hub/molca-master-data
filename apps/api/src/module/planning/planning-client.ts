// HTTP client for dx-production-planning (`PLANNING_API_URL`), the one
// cross-service read this API makes. Planning's `/job-orders/executions` payload
// (which replaced `/job-orders/operations`, Planning #15) feeds three readers that
// each project it differently: KPI results (execution quantities, joined to their
// Job Order), site-hierarchy deactivation (open Job Orders below a node) and
// product closure (open work orders of a product).
//
// One private request<T>() carries every call's policy:
//
//   request<T>(operation, path, schema)
//     │
//     ├─ fetch(url, Bearer <user's token>?, AbortSignal(timeout))
//     │    ├─ aborted  -> PlanningError timeout
//     │    └─ threw    -> PlanningError network_error
//     ├─ !ok           -> PlanningError http_error (status kept, 401/403 included)
//     ├─ body not JSON -> PlanningError parse_error
//     ├─ schema miss   -> PlanningError parse_error
//     └─ ok            -> parsed data
//
// AUTH IS THE USER'S, NOT A SERVICE'S. The user's bearer is forwarded so Planning
// scopes the answer to the same tenant (F-00 rule 6). That is why this client
// reads the request context: the same instance serves every request and the
// bearer is per request. There is no service-token provider and no retry on
// 401/403: an expired user token must surface to the caller, not be silently
// re-minted with a credential that is not the user's.
//
// Errors that reach a caller are mapped by planningUnreachable() to the refusal
// `planning_unreachable` (503), so an unreachable Planning is never read as
// "nothing running".

import type {
  PlanningClientContract,
  PlanningExecutionsPayload,
  PlanningShiftBreakRow,
} from "@molca/contract-client";
import type { ZodType } from "zod";

import * as z from "zod";

import {
  getPlanningDurationHistogram,
  getPlanningRequestsCounter,
} from "../../shared/observability/metrics.js";
import { currentBearer } from "../../shared/tenant/tenant-context.js";
import { PlanningError, type PlanningErrorCause } from "./planning-error.js";
import { breaksEnvelopeSchema, executionsEnvelopeSchema } from "./planning-schema.js";

type PlanningClientDeps = {
  planningBaseUrl: string;
  planningTimeoutMs: number;
};

const EXECUTIONS_PATH = "/api/v1/job-orders/executions";
const BREAKS_PATH = "/api/v1/breaktime/all";

class PlanningClient implements PlanningClientContract {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor({ planningBaseUrl, planningTimeoutMs }: PlanningClientDeps) {
    this.baseUrl = planningBaseUrl;
    this.timeoutMs = planningTimeoutMs;
  }

  /** Executions joined with their Job Order: the plan (work order, operation) is the Job Order's. */
  async executions(): Promise<PlanningExecutionsPayload> {
    const operation = "executions";
    const body = await this.request(operation, EXECUTIONS_PATH, executionsEnvelopeSchema);

    // A 200 with `data: null` is not an answer. Counted here as parse_error,
    // not as ok, so the metric never records a null payload as success.
    if (body.data === null) {
      throw this.fail(operation, "parse_error", "response carried no data");
    }
    const { workOrders, jobOrders, executions } = body.data;
    const jobOrderOf = new Map(jobOrders.map((j) => [j.id, j]));
    const joined = executions.map((e) => {
      const job = jobOrderOf.get(e.jobOrderId);
      if (!job) {
        throw this.fail(operation, "parse_error", `execution ${e.id} has no job order`);
      }
      return {
        id: e.id,
        workOrderId: job.workOrderId,
        operationId: job.operationId,
        workUnitId: e.workUnitId,
        shiftInstanceId: e.shiftInstanceId,
        goodQty: e.goodQty,
        scrapQty: e.scrapQty,
        reworkQty: e.reworkQty,
        actualStart: e.actualStart,
        actualEnd: e.actualEnd,
        status: e.status,
      };
    });
    this.count(operation, "ok");
    return { workOrders, jobOrders, executions: joined };
  }

  /** K-28's input: every effective-dated SHIFT_BREAK row of one site, so a shift keeps the hours it started with. */
  async breaks(siteId: string): Promise<PlanningShiftBreakRow[]> {
    const operation = "breaks";
    // Like executions(): a 200 whose envelope carries an error (or no data) is
    // a contract break, never "no breaks" — silent zero breaks would count
    // every stop as unplanned and drop Availability.
    const body = await this.request(
      operation,
      `${BREAKS_PATH}?siteId=${encodeURIComponent(siteId)}`,
      breaksEnvelopeSchema,
    );
    if (body.data === null) {
      throw this.fail(operation, "parse_error", "response carried no data");
    }
    const rows = body.data;
    this.count(operation, "ok");
    return rows;
  }

  private async request<T extends ZodType>(
    operation: string,
    path: string,
    schema: T,
  ): Promise<z.infer<T>> {
    const startedAt = Date.now();
    try {
      // No retry here (see the header): a rejected user token is an error to report.
      const res = await this.send(operation, `${this.baseUrl}${path}`);
      if (!res.ok) {
        throw this.fail(operation, "http_error", `upstream returned ${res.status}`, res.status);
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch (err) {
        throw this.fail(operation, "parse_error", `response was not JSON: ${shortError(err)}`);
      }

      const parsed = z.safeParse(schema, json);
      if (!parsed.success) {
        throw this.fail(
          operation,
          "parse_error",
          `response did not match the expected shape: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    } finally {
      // Recorded for successes and failures alike: a timeout's duration is the most useful one.
      getPlanningDurationHistogram().record(Date.now() - startedAt, { operation });
    }
  }

  private async send(operation: string, url: string): Promise<Response> {
    // Read per request from the AsyncLocalStorage context, so each caller's own bearer is sent.
    const bearer = currentBearer();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, {
        headers: {
          Accept: "application/json",
          // Absent outside a tenant request (seed, tests, login): no header, never an empty Bearer.
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        signal: controller.signal,
      });
    } catch (err) {
      // A timeout points at Planning latency; a network error at DNS, routing or a dead pod.
      if (controller.signal.aborted) {
        throw this.fail(operation, "timeout", `request timed out after ${this.timeoutMs}ms`);
      }
      throw this.fail(operation, "network_error", shortError(err));
    } finally {
      clearTimeout(timer);
    }
  }

  // Counting here, not at each throw site, so no failure path can skip the metric.
  private fail(
    operation: string,
    cause: PlanningErrorCause,
    message: string,
    status?: number,
  ): PlanningError {
    this.count(operation, cause);
    return new PlanningError({ cause, operation, message, status });
  }

  private count(operation: string, outcome: string): void {
    getPlanningRequestsCounter().add(1, { operation, outcome });
  }
}

function shortError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export { PlanningClient };
export type { PlanningClientDeps };
