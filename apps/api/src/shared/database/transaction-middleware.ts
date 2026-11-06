import type { MiddlewareHandler } from "hono";

import type { Transact } from "./transaction.js";

const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);

/** Thrown inside the transaction only to roll it back; never leaves the middleware. */
const ROLLBACK = Symbol("rollback");

/**
 * One write request = one transaction (#18). Every row a POST/PUT/PATCH/DELETE
 * writes — a BOM and its lines, a close-then-insert version, the cascade of a
 * deactivation, and the audit row — commits together or not at all.
 *
 * Hono turns a thrown error into the error response inside `next()` instead of
 * rethrowing it, so the outcome is read from `c.error` and the status: a
 * refusal or failure (4xx/5xx) rolls back, and the response built by
 * `onError` is still sent.
 */
function transactionMiddleware(transact: Transact): MiddlewareHandler {
  return async (c, next) => {
    if (READ_ONLY.has(c.req.method)) return next();
    try {
      await transact(async () => {
        await next();
        if (c.error || c.res.status >= 400) throw ROLLBACK;
      });
    } catch (err) {
      if (err !== ROLLBACK) throw err;
    }
  };
}

export { transactionMiddleware };
