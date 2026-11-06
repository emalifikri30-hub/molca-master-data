// PRD-003 PRO-003 §4 / F-06 §9.4 / F-08 §9.2.1: convert a quantity of one
// product between two units. One PRODUCT_UOM_CONVERSION row covers both
// directions: read forward (from → to) it multiplies, read backward it
// divides; if both directions exist for the pair and date, the forward row
// wins. A path is the same unit, one row, or two rows joined through the
// product's base unit. Only rows active on the date count:
// `valid_from ≤ date AND (valid_to IS NULL OR valid_to > date)`.
//
// Pure, no store access — copied to apps/web/src/features/products and to the
// Production apps' APIs. Keep the copies in step.

export interface ConversionRow {
  productId: string;
  fromUomId: string;
  toUomId: string;
  conversionValue: number;
  validFrom?: string;
  validTo?: string | null;
}

export interface ConversionStep {
  row: ConversionRow;
  direction: "forward" | "backward";
}

export interface ConversionPath {
  /** `qty_in_to = qty_in_from × factor`. */
  factor: number;
  /** Empty for the same unit. */
  steps: Array<ConversionStep>;
}

export function activeOn(row: { validFrom?: string; validTo?: string | null }, date: string) {
  return (row.validFrom ?? "") <= date && (row.validTo == null || row.validTo > date);
}

function oneStep(
  rows: ReadonlyArray<ConversionRow>,
  from: string,
  to: string,
): ConversionStep | null {
  const forward = rows.find((r) => r.fromUomId === from && r.toUomId === to);
  if (forward) return { row: forward, direction: "forward" };
  const backward = rows.find((r) => r.fromUomId === to && r.toUomId === from);
  return backward ? { row: backward, direction: "backward" } : null;
}

const factorOf = (s: ConversionStep) =>
  s.direction === "forward" ? s.row.conversionValue : 1 / s.row.conversionValue;

/** The conversion path from `fromUomId` to `toUomId` for one product on `date`; null = none. */
export function conversionPath(
  rows: ReadonlyArray<ConversionRow>,
  product: { id: string; baseUomId: string },
  fromUomId: string,
  toUomId: string,
  date: string,
): ConversionPath | null {
  if (fromUomId === toUomId) return { factor: 1, steps: [] };
  const mine = rows.filter(
    (r) => r.productId === product.id && r.conversionValue > 0 && activeOn(r, date),
  );
  const direct = oneStep(mine, fromUomId, toUomId);
  if (direct) return { factor: factorOf(direct), steps: [direct] };
  const base = product.baseUomId;
  if (fromUomId === base || toUomId === base) return null;
  const a = oneStep(mine, fromUomId, base);
  const b = oneStep(mine, base, toUomId);
  if (!a || !b) return null;
  return { factor: factorOf(a) * factorOf(b), steps: [a, b] };
}

/** Units reachable from the product's base unit on `date` (WMS-003 item-unit picker). */
export function convertibleUnits(
  rows: ReadonlyArray<ConversionRow>,
  product: { id: string; baseUomId: string },
  unitIds: ReadonlyArray<string>,
  date: string,
): Array<string> {
  return unitIds.filter((u) => conversionPath(rows, product, u, product.baseUomId, date) !== null);
}

/** Round half-up to 6 decimal places (F-08 §9.2, PRO-003 numeric limit). */
export function round6(n: number): number {
  return (Math.sign(n) * Math.round(Math.abs(n) * 1e6 + 1e-9)) / 1e6;
}
