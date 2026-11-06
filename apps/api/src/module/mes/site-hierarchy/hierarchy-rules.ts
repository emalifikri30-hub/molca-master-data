// PRD-003 US-FND-SIT-001 — shared validation rules for the location
// hierarchy (Site / Area / Work Center / Work Unit). Pure functions, so the
// services stay thin and the rules are unit-testable on their own.
import { HTTPException } from "hono/http-exception";

import { sameCode } from "../../../shared/util/code-match.js";
import { findSegmentClash, segmentClashMessage } from "../asset-tags/generated-address.js";

/** "Text limits: names up to 80 characters, codes up to 20 characters." */
const NAME_MAX_LENGTH = 80;
const CODE_MAX_LENGTH = 20;

/**
 * Rule 9 (F-01 S-4, PO 2026-10-02): a site, area, work center or class code
 * may contain letters, digits, `_` and `-` (no `/`, no `.`, no spaces), saved
 * as typed (`FI-2`); it is cleaned only inside a generated address. A work
 * unit code stays letters, digits and `_` until S-10 decides about `-`.
 * Messages: `sit-001.error.code-chars` (two texts).
 */
const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
const CODE_CHARS_MESSAGE = "Use only letters, numbers, _ and - in the code.";
const WORK_UNIT_CODE_PATTERN = /^[A-Za-z0-9_]+$/;
const WORK_UNIT_CODE_CHARS_MESSAGE = "Use only letters, numbers and _ in the code.";

type CodedRow = { id: string; code: string; name: string };

/** Today as `YYYY-MM-DD`, the clock the services use for valid_from / valid_to. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * PRD-003 SIT-001 rule 2 (PO, 2026-10-21): only ACTIVE rows hold a code.
 * Active = `validTo` is null or later than `date`. valid_to is exclusive, so a
 * row closed today is no longer in force and frees its code.
 */
function isActiveRow(row: { validTo?: string | null }, date = today()): boolean {
  return row.validTo == null || row.validTo > date;
}

/**
 * Rule 2: the first row (other than `excludeId`, the row being edited) that
 * already uses `code`. Callers pass only the ACTIVE rows in the uniqueness scope
 * (sites of one enterprise, areas of one site, work centers of one area, work
 * units of one work center). Codes that differ only by letter case or
 * surrounding spaces are the same code (docs-molcadx#142); the code is still
 * saved as typed.
 */
function findCodeConflict<T extends CodedRow>(
  rows: Iterable<T>,
  code: string,
  excludeId?: string,
): T | undefined {
  for (const row of rows) {
    if (row.id !== excludeId && sameCode(row.code, code)) return row;
  }
  return undefined;
}

/** Rule 2's exact message. */
function codeConflictMessage(code: string, nodeName: string): string {
  return `Code ${code} is already used by ${nodeName}. Use another code.`;
}

/**
 * Throws 409 with rule 2's message when `code` is already taken in scope, or
 * with `sit-001.error.segment-clash` when a sibling under the same parent
 * cleans to the same address segment (rule 9, AC-16). `rows` is the active
 * scope for the code check; `siblings` (defaults to `rows`) is every sibling,
 * retired ones included, for the segment clash, which is unchanged by PRD-003
 * SIT-001 rule 2.
 */
function assertCodeAvailable(
  rows: ReadonlyArray<CodedRow>,
  code: string,
  excludeId?: string,
  siblings: ReadonlyArray<CodedRow> = rows,
): void {
  const conflict = findCodeConflict(rows, code, excludeId);
  if (conflict) {
    throw new HTTPException(409, { message: codeConflictMessage(code, conflict.name) });
  }
  const clash = findSegmentClash(
    siblings.filter((r) => r.id !== excludeId),
    code,
  );
  if (clash) {
    throw new HTTPException(409, { message: segmentClashMessage(clash.code, code) });
  }
}

let ianaTimezones: Set<string> | undefined;

/** Rule 3: a timezone from the IANA list, never a fixed offset like +07:00. */
function isIanaTimezone(value: string): boolean {
  ianaTimezones ??= new Set(Intl.supportedValuesOf("timeZone"));
  return ianaTimezones.has(value);
}

export {
  CODE_PATTERN,
  CODE_CHARS_MESSAGE,
  WORK_UNIT_CODE_PATTERN,
  WORK_UNIT_CODE_CHARS_MESSAGE,
  NAME_MAX_LENGTH,
  CODE_MAX_LENGTH,
  today,
  isActiveRow,
  findCodeConflict,
  codeConflictMessage,
  assertCodeAvailable,
  isIanaTimezone,
};
