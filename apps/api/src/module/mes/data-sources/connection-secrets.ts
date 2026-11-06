// PRD-003 US-FND-DSR-001 rules 2 and 16, US-FND-AUD-001 AC-8 (PO 2026-10-02,
// F-13 §9.1 "Editing a data source", F-14 core concept 8): the endpoint part
// of `connection_config` is not secret and is shown and logged in clear, so an
// IP change can be traced; the credential part is never shown, in any form.
//
// Which sub-fields exist per protocol is still open (F-13 H-DS-2). The spec
// names the endpoint ones — broker URL, server endpoint, host, port — so those
// keys are clear and **every other key is treated as a credential**: an
// unknown key is masked rather than leaked.
//
// Pure, no store access — copied to apps/web/src/features/data-sources
// (source form, audit diff). Keep the copies in step.

const MASK = "••••••";

/** Key names of the endpoint part, compared without case, `_` or `-`. */
const ENDPOINT_KEYS = new Set(["endpoint", "serverendpoint", "url", "brokerurl", "host", "port"]);

function isEndpointKey(key: string): boolean {
  return ENDPOINT_KEYS.has(key.toLowerCase().replace(/[_-]/g, ""));
}

/** Endpoint values as stored, every credential value masked; keys kept. */
function maskConfig(config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, isEndpointKey(key) ? value : MASK]),
  );
}

/**
 * DSR-001 rule 16: a credential left empty keeps the stored value; a typed
 * value replaces it. The masked placeholder counts as empty, so a form that
 * sends back what it was given never overwrites a password with "••••••".
 * Keys not sent are removed — the typed settings are the new settings.
 */
function mergeConfig(
  stored: Record<string, string>,
  typed: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(typed)) {
    const empty = value === "" || value === MASK;
    if (!isEndpointKey(key) && empty) {
      if (stored[key] !== undefined) out[key] = stored[key];
      continue;
    }
    out[key] = value;
  }
  return out;
}

export { MASK, isEndpointKey, maskConfig, mergeConfig };
