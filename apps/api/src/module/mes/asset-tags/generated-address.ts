// PRD-003 US-FND-DSR-001 — the generated tag address (F-04 §9.7.1,
// "How a generated address is built"): derived on read from the machine's
// active placement, the source's naming choice and the tag name. Never
// stored, never writable (`ASSET_TAGS.generated_node`).
//
// Pure, no store access — copied to apps/web/src/features/data-sources
// (tags list, tag form preview, asset tab, KPI panel). Keep the copies in
// step.

/**
 * Codes along the placement path, WORK_UNIT → WORK_CENTER → AREA → SITE →
 * ENTERPRISE. The enterprise is the first segment since 2026-10-02 (PO,
 * F-04 §9.7.1): a site code is unique only inside its enterprise.
 */
export interface AddressCodes {
  enterprise: string;
  site: string;
  area: string;
  workCenter: string;
  workUnit: string;
}

export interface GeneratedAddressInput {
  /** A source's naming choice; `manual` produces no generated address. */
  nodeNaming: "generated" | "manual";
  protocol: "mqtt" | "opcua" | "other";
  /**
   * OPC UA: the namespace, typed as the gateway shows it (PO 2026-10-06) —
   * a URI or a numeric index. One address string carries one form, never
   * both: `nsu=` for a URI, `ns=` for an index.
   */
  namespaceUri: string;
  /** MQTT: optional leading root, joined with "/" per the spec formula. */
  topicRoot: string;
  /** null = no active placement, or a multi-lane tag with no own lane (rules 12/13). */
  codes: AddressCodes | null;
  assetTag: string;
  tagName: string;
}

/**
 * DSR-001 (PO 2026-10-06): the namespace is typed as the gateway shows it.
 * `index` = a whole number ≥ 0, `uri` = anything that reads as a URI; a value
 * that is neither is refused at save (`dsr-001.error.namespace-format`).
 */
export function namespaceForm(value: string): "uri" | "index" | "invalid" {
  if (/^\d+$/.test(value)) return "index";
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return "uri";
  return "invalid";
}

/**
 * The address prefix of one namespace value (DSR-001 §4, PO 2026-10-06):
 *
 *   ns_part() = "nsu=" + namespace_uri   when the value is not all digits (a namespace URI)
 *               "ns="  + namespace_uri   when the value is all digits (a namespace index)
 */
export function nsPart(namespace: string): string {
  return namespaceForm(namespace) === "index" ? `ns=${namespace}` : `nsu=${namespace}`;
}

/**
 * Exact formula (DSR-001 §4):
 *
 *   generated_node (opcua) = ns_part() + ";s=" + clean(enterprise_code) + "/" +
 *     clean(site_code) + "/" + clean(area_code) + "/" + clean(work_center_code) + "/" +
 *     clean(work_unit_code) + "/" + clean(asset_tag) + "/" + tag_name
 *
 *   generated_node (mqtt)  = [topic_root + "/"] + clean(enterprise_code) + "/" +
 *     clean(site_code) + "/" + clean(area_code) + "/" + clean(work_center_code) + "/" +
 *     clean(work_unit_code) + "/" + clean(asset_tag) + "/" + tag_name
 *     (one value per topic, since 2026-09-28)
 *
 * Empty when node_naming = manual, or no active placement, or (multi-lane)
 * work_unit_id is unset / has no active placement.
 */
export function generatedAddress(input: GeneratedAddressInput): string {
  if (input.nodeNaming !== "generated") return "";
  if (input.codes === null || input.assetTag === "" || input.tagName === "") return "";
  const { enterprise, site, area, workCenter, workUnit } = input.codes;
  const path = [
    ...[enterprise, site, area, workCenter, workUnit, input.assetTag].map(cleanSegment),
    input.tagName,
  ];
  if (input.protocol === "mqtt") {
    const root = input.topicRoot === "" ? "" : `${input.topicRoot}/`;
    return root + path.join("/");
  }
  if (input.protocol === "opcua") {
    return `${nsPart(input.namespaceUri)};s=${path.join("/")}`;
  }
  // `other` protocols have no generated-address scheme in the spec.
  return "";
}

/**
 * PRD-003 SIT-001 rule 9 / AST-002 rule 8 / DSR-001 rule 10 (PO 2026-10-02):
 *
 *   clean(x) = every character of x that is not a letter, digit or _ becomes _
 *
 * Codes are kept as typed (`FI-2`, `ANRITSU 57-1`); only the address segment
 * is cleaned (`FI_2`, `ANRITSU_57_1`). The tag name is never cleaned — its own
 * rule (letters, digits, `_`) already holds.
 */
export function cleanSegment(code: string): string {
  return code.replace(/[^A-Za-z0-9_]/g, "_");
}

/** True when a code of the address path changes when cleaned (`dsr-001.tags.address.cleaned-hint`). */
export function wasCleaned(codes: ReadonlyArray<string>): boolean {
  return codes.some((code) => cleanSegment(code) !== code);
}

/**
 * Sibling clash (F-04 §9.7.1 "Segments", PO 2026-10-02): the first sibling
 * under the same parent whose code is different but cleans to the same
 * segment as `code`. Exact duplicates are the code-uniqueness rule's job.
 */
export function findSegmentClash<T extends { code: string }>(
  siblings: Iterable<T>,
  code: string,
): T | undefined {
  const segment = cleanSegment(code);
  for (const sibling of siblings) {
    if (sibling.code !== code && cleanSegment(sibling.code) === segment) return sibling;
  }
  return undefined;
}

/**
 * `sit-001.error.segment-clash` = `dsr-001.error.segment-clash` (UX 01 / UX 04 / UX 13):
 * "<code 1> and <code 2> both become <segment> in the tag address. Change one of them." (draft)
 */
export function segmentClashMessage(code1: string, code2: string): string {
  return `${code1} and ${code2} both become ${cleanSegment(code1)} in the tag address. Change one of them.`;
}
