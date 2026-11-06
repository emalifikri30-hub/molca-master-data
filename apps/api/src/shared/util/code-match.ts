// docs-molcadx#142 (PO): codes that differ only by letter case or by
// surrounding spaces are duplicates. The code is saved as typed; only the
// comparison ignores case and surrounding spaces.

/** The comparison key for a code: trimmed and lower-cased. */
export function codeKey(code: string): string {
  return code.trim().toLowerCase();
}

/** True when `a` and `b` are the same code under docs-molcadx#142. */
export function sameCode(a: string, b: string): boolean {
  return codeKey(a) === codeKey(b);
}
