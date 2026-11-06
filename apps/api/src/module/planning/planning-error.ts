import type { HTTPException } from "hono/http-exception";

import { refusal } from "../../shared/errors/refusal.js";

// One label per distinct operator action:
//   timeout       -> Planning is slow; look at dx-production-planning latency
//   network_error -> Planning is unreachable; look at DNS, routing or pods
//   http_error    -> Planning answered with a failure; look at `status`
//   auth_error    -> reserved; this client forwards the user's bearer and never
//                    retries, so a 401/403 is reported as http_error with its status
//   parse_error   -> Planning's response shape changed; look at the contract
type PlanningErrorCause = "timeout" | "network_error" | "http_error" | "auth_error" | "parse_error";

type PlanningErrorOptions = {
  cause: PlanningErrorCause;
  operation: string;
  message: string;
  status?: number;
};

class PlanningError extends Error {
  readonly errorCause: PlanningErrorCause;
  readonly operation: string;
  readonly status?: number;

  constructor({ cause, operation, message, status }: PlanningErrorOptions) {
    super(message);
    this.name = "PlanningError";
    // Not named `cause`: Error already owns that slot for the wrapped error.
    this.errorCause = cause;
    this.operation = operation;
    this.status = status;
  }

  toMetadata(): Record<string, string | number> {
    return {
      planning_operation: this.operation,
      planning_cause: this.errorCause,
      ...(this.status === undefined ? {} : { planning_status: this.status }),
    };
  }
}

function isPlanningError(err: unknown): err is PlanningError {
  return err instanceof PlanningError;
}

// Every cause maps to the same refusal. The
// screens that read Planning only need one answer: "jobs unknown, so refuse".
// The typed cause still labels the metric and the error object, but it is not
// sent to the browser, so the detail is deliberately dropped here.
function planningUnreachable(_err: unknown): HTTPException {
  return refusal(503, "planning_unreachable");
}

export { PlanningError, isPlanningError, planningUnreachable };
export type { PlanningErrorCause, PlanningErrorOptions };
