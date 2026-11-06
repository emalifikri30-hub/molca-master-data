// PRD-003 US-FND-WMS-006 — pure rules for ASSET_PRODUCT_CODES (F-04 §9.7):
// row status, the save checks, the A-6b overlap on (asset_id, raw_value) and
// which product a reading means. Times are UTC ISO timestamps; a row is in
// force on [validFrom, validTo), validTo null = open-ended.

type CodeStatus = "active" | "scheduled" | "ended";

type CodeWindow = { validFrom: string; validTo: string | null };

/** A code row with the asset its tag belongs to (tag_id → ASSET_TAGS.asset_id). */
type AssetCodeRow = CodeWindow & {
  id: string;
  assetId: string;
  rawValue: string;
  productId: string;
};

type CodeInputRefusal = "required" | "order" | "invalid_time";

function ms(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * WMS-006 §4 status: Active = valid_from ≤ now AND (valid_to IS NULL OR
 * valid_to > now); Scheduled = valid_from > now; Ended = valid_to ≤ now.
 */
function codeStatus(row: CodeWindow, now: string): CodeStatus {
  if (ms(row.validFrom) > ms(now)) return "scheduled";
  if (row.validTo !== null && ms(row.validTo) <= ms(now)) return "ended";
  return "active";
}

/** WMS-006 rule 4: raw value and start required; the end, when set, after the start. */
function checkCodeInput(input: {
  rawValue: string;
  validFrom: string;
  validTo?: string | null;
}): CodeInputRefusal | null {
  // Rule: the raw value is compared exactly as stored — no trimming (§4 edge cases).
  if (input.rawValue === "" || input.validFrom === "") return "required";
  if (Number.isNaN(ms(input.validFrom))) return "invalid_time";
  if (input.validTo !== undefined && input.validTo !== null) {
    if (Number.isNaN(ms(input.validTo))) return "invalid_time";
    if (ms(input.validTo) <= ms(input.validFrom)) return "order";
  }
  return null;
}

function windowsOverlap(a: CodeWindow, b: CodeWindow): boolean {
  const aEnd = a.validTo === null ? Infinity : ms(a.validTo);
  const bEnd = b.validTo === null ? Infinity : ms(b.validTo);
  return ms(a.validFrom) < bEnd && ms(b.validFrom) < aEnd;
}

/**
 * WMS-006 rule 1 (A-6b): on one asset, across all its product_code tags, a
 * raw value maps to at most one product at any time. Returns the row the
 * candidate would overlap, if any. The check is on (asset_id, raw_value),
 * never on tag_id alone.
 */
function findOverlap(
  candidate: CodeWindow & { assetId: string; rawValue: string; excludeId?: string },
  rows: ReadonlyArray<AssetCodeRow>,
): AssetCodeRow | undefined {
  return rows.find(
    (r) =>
      r.id !== candidate.excludeId &&
      r.assetId === candidate.assetId &&
      r.rawValue === candidate.rawValue &&
      windowsOverlap(r, candidate),
  );
}

/**
 * WMS-006 §4 "which product a reading means" (F-07.1): the product of the
 * row on the reading tag's asset with raw value v in force at t. null =
 * unmapped (the segment has no standard).
 */
function resolveProduct(
  rows: ReadonlyArray<AssetCodeRow>,
  assetId: string,
  rawValue: string,
  at: string,
): string | null {
  const hit = rows.find(
    (r) =>
      r.assetId === assetId &&
      r.rawValue === rawValue &&
      ms(r.validFrom) <= ms(at) &&
      (r.validTo === null || ms(r.validTo) > ms(at)),
  );
  return hit?.productId ?? null;
}

export { checkCodeInput, codeStatus, findOverlap, resolveProduct, windowsOverlap };
export type { AssetCodeRow, CodeInputRefusal, CodeStatus, CodeWindow };
