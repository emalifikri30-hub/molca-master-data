import { HTTPException } from "hono/http-exception";

import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * A business-rule refusal the screen needs to explain in detail (which year
 * overlaps, which blockers, …). The shared error handler sends the message
 * as `error`; the `REFUSAL:` prefix + JSON lets the web client turn it back
 * into a typed refusal. Same idea as the `CONFLICT:` / `LANE_CHOICE:`
 * messages of asset-placements. `code` stays first and a `code` key in
 * `details` can never replace it; send other codes under their own key
 * (`holderCode`, `value`).
 */
function refusal(
  status: ContentfulStatusCode,
  code: string,
  details: Record<string, unknown> = {},
): HTTPException {
  return new HTTPException(status as 400, {
    message: `REFUSAL:${JSON.stringify(Object.assign({ code }, details, { code }))}`,
  });
}

export { refusal };
