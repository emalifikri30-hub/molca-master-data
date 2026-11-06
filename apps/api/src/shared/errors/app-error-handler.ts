import { mapDomainError } from "@molca/helper";
import { WebResponse } from "@molca/network";
import { baseLogger, getRequestContext } from "@molca/observability";
import { serializeError } from "@molca/utils";

import { mapPgError } from "./pg-error.js";

import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * The app's `onError`: a refusal or a database key clash becomes its status with
 * `{ data: null, error: "<message>" }`; anything else is logged and sent as 500.
 */
const appErrorHandler: ErrorHandler = async (err, c) => {
  const mapped = mapDomainError(err) ?? mapPgError(err);
  if (mapped !== null) {
    const errRes = mapped.getResponse();
    const errMessage: string = await errRes.text();
    const errStatus: ContentfulStatusCode = errRes.status as ContentfulStatusCode;
    return c.json(WebResponse.builder<string>().error(errMessage).build(), errStatus);
  }

  const log = getRequestContext()?.logger ?? baseLogger;
  log.withMetadata({ err: serializeError(err) }).error("internal_server_error");
  return c.json(WebResponse.builder<string>().error("internal server error").build(), 500);
};

export { appErrorHandler };
