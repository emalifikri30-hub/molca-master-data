// FI-2 packaging SKUs (sheet of finished goods).
// One PRODUCT per New SKU Code, shared by every line that runs it.
// The pouch is the base unit (pcs). An inner or a calendar, and the carton,
// are PRODUCT_UOM_CONVERSION rows back to that pouch — not separate products.
// PRO-002 (per-unit measurement, PO 2026-10-05): every unit gets its own
// PRODUCT_UOM_MEASUREMENT row — the pouch envelope in grams comes from the
// sheet; the sheet's inner and carton envelopes have no numbers in this file,
// so those rows carry demo gross values shaped like the PRD's worked example
// (AC-12: the box adds to the contents — gross is never count × per-piece).
// Pouches-per-minute is not stored. PRODUCT_CYCLE is retired; a rate belongs
// on the work-unit operation, which this sheet does not define.
// PLC and weigher numbers are ASSET_PRODUCT_CODES on that machine's
// Product_Code tag. A raw value claimed by two SKUs on one asset is skipped.

import { and, eq, inArray, like } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { assetKey, gatewayIdForAsset } from "./seed-fi2-nodes.js";
import {
  assetProductCodeTable,
  measurementGroupTable,
  productDetailTable,
  productTable,
  productUomConversionTable,
  productUomMeasurementTable,
  unitOfMeasurementTable,
} from "./schema/schema.js";
import { MEASUREMENT_GROUPS } from "../../module/mes/reference-data/measurement-groups.js";

const VALID_FROM = "2026-02-03";

const PCS = "uom-pcs";
const INNER = "uom-inner";
const CAL = "uom-cal";
const CTN = "uom-ctn";
const GRAM = "uom-g";

type Mid = "inner" | "calendar";

type Sku = {
  code: string;
  name: string;
  pouch: [min: number, std: number, max: number];
  mid?: { unit: Mid; count: number };
  /** Mid-packs per carton, or pouches per carton when there is no mid-pack. */
  carton: number;
};

type Link = { product: string; asset: string; raw: string[] };

const SKUS: Sku[] = [
  {
    code: "A5RB 90 GR",
    name: "A5RB (1X120) 90gr",
    pouch: [87.003, 90, 93.996],
    mid: { unit: "inner", count: 12 },
    carton: 10,
  },
  {
    code: "MJCL 7.5 GR",
    name: "MJCL (6X4X14) 7.5gr",
    pouch: [7.3, 7.5, 7.7],
    mid: { unit: "calendar", count: 24 },
    carton: 14,
  },
  {
    code: "50 GR",
    name: "50GR (20x12) 50.0 gr",
    pouch: [48.5, 50, 51],
    mid: { unit: "inner", count: 20 },
    carton: 12,
  },
  {
    code: "RC 50GR",
    name: "RC 50GR 12Kg Exp",
    pouch: [50, 50, 51.5],
    mid: { unit: "inner", count: 20 },
    carton: 12,
  },
  {
    code: "PTCL 16 GR",
    name: "PTCL (10X2X18) 16gr",
    pouch: [15.8, 16, 16.496],
    mid: { unit: "calendar", count: 20 },
    carton: 18,
  },
  {
    code: "250 GR-RC",
    name: "250G-RC (1x80) 250.0 gr",
    pouch: [247, 250, 253],
    mid: { unit: "inner", count: 10 },
    carton: 8,
  },
  { code: "250 GR-LC", name: "250G-LC (1x48) 250.0 gr", pouch: [247, 250, 253], carton: 48 },
  { code: "500 GR-LC", name: "500G (1x24) 500.0 gr", pouch: [497, 500, 503], carton: 24 },
  { code: "KGRC", name: "KGRC (1x20) 1000.0 gr", pouch: [997, 1000, 1003], carton: 20 },
  { code: "KGLC", name: "KGLC (1x12) 1000.0 gr", pouch: [997, 1000, 1003], carton: 12 },
  {
    code: "AP 120 GR",
    name: "AP120g",
    pouch: [118.8, 120, 121.2],
    mid: { unit: "inner", count: 12 },
    carton: 10,
  },
  {
    code: "250 GR-RC EXP",
    name: "250G-RC (1x48) 250.0 gr Exp",
    pouch: [250, 250, 253],
    carton: 48,
  },
  { code: "KGLC EXP", name: "LC 1KG (1X12) Exp", pouch: [1000, 1000, 1003], carton: 12 },
  { code: "KGRC EXP", name: "RC 1KG (1X20) Exp", pouch: [1000, 1000, 1003], carton: 20 },
  {
    code: "100 GR",
    name: "100G (10x12) 100.0 gr",
    pouch: [97, 100, 103],
    mid: { unit: "inner", count: 10 },
    carton: 12,
  },
  {
    code: "100 GR 12-LC EXP",
    name: "LC 100GR (10X12) Exp",
    pouch: [100, 100, 103],
    mid: { unit: "inner", count: 10 },
    carton: 12,
  },
  {
    code: "100 GR 12-RC EXP",
    name: "RC 100GR (10X12) Exp",
    pouch: [100, 100, 103],
    mid: { unit: "inner", count: 10 },
    carton: 6,
  },
  {
    code: "100 GR 18-LC EXP",
    name: "LC 100GR ( 10 X 18 ) EXP",
    pouch: [100, 100, 103],
    mid: { unit: "inner", count: 10 },
    carton: 18,
  },
  {
    code: "100 GR 18-RC EXP",
    name: "RC 100GR (10X18) Exp",
    pouch: [100, 100, 103],
    mid: { unit: "inner", count: 30 },
    carton: 18,
  },
  {
    code: "100 GR 18-RC EGYPT EXP",
    name: "RC 100g EGYPT ( 10 X 18 ) EXP",
    pouch: [100, 100, 103],
    mid: { unit: "inner", count: 10 },
    carton: 18,
  },
  { code: "AJPKG", name: "AJPKG (1 x 20 ) 1 Kg", pouch: [1000, 1000, 1025], carton: 20 },
  {
    code: "AJP 200 GR",
    name: "AJP (1 x 6 ) 200 Gr",
    pouch: [198, 200, 206],
    mid: { unit: "inner", count: 5 },
    carton: 6,
  },
  { code: "APKG", name: "APKG (1 x 20 ) 1000.0 gr", pouch: [1000, 1000, 1025], carton: 20 },
  { code: "KGAE", name: "KGAE (1X20) 1000 Gr", pouch: [1000, 1000, 1025], carton: 20 },
  { code: "APKG EXP", name: "APKG (1 x 20 ) 1000.0 gr EXP", pouch: [1000, 1000, 1009], carton: 20 },
];

// Asset tag is the machine whose Product_Code tag reports the raw value.
// Bag numbers on a line with no bag weigher sit on that line's first
// checkweigher (calendar on line 4 and 6, inner on line 10).
const LINKS: Link[] = [
  { product: "A5RB 90 GR", asset: "MITSUM-1", raw: ["1"] },
  { product: "A5RB 90 GR", asset: "ANRITSU62-1", raw: ["1", "2", "17"] },
  { product: "A5RB 90 GR", asset: "ANRITSU54-1", raw: ["1", "2", "5", "10", "15", "101"] },
  { product: "A5RB 90 GR", asset: "ANRITSU 57-1", raw: ["56"] },
  { product: "A5RB 90 GR", asset: "MITSUM-2", raw: ["1"] },
  { product: "A5RB 90 GR", asset: "ANRITSU62-2", raw: ["3", "4", "7", "9", "12", "13"] },
  { product: "A5RB 90 GR", asset: "ANRITSU57-2", raw: ["1"] },
  { product: "A5RB 90 GR", asset: "MITSUM-3", raw: ["1"] },
  { product: "A5RB 90 GR", asset: "ANRITSU62-3", raw: ["1", "2"] },
  { product: "A5RB 90 GR", asset: "YAMATO-2", raw: ["2"] },
  { product: "A5RB 90 GR", asset: "ANRITSU57-3", raw: ["8", "0"] },

  { product: "MJCL 7.5 GR", asset: "MITSUM-6", raw: ["1"] },
  { product: "MJCL 7.5 GR", asset: "ANRITSU64-6", raw: ["16"] },
  { product: "MJCL 7.5 GR", asset: "ANRITSU57-7", raw: ["5"] },

  { product: "50 GR", asset: "YAMATO-3", raw: ["2"] },
  { product: "50 GR", asset: "ANRITSU58-1", raw: ["0"] },
  { product: "RC 50GR", asset: "YAMATO-3", raw: ["2"] },
  { product: "RC 50GR", asset: "ANRITSU58-1", raw: ["8", "0"] },

  { product: "PTCL 16 GR", asset: "MITSUM-4", raw: ["1"] },
  { product: "PTCL 16 GR", asset: "YAMATO-11", raw: ["2", "10"] },
  { product: "PTCL 16 GR", asset: "MITSUM-5", raw: ["1"] },
  { product: "PTCL 16 GR", asset: "YAMATO-12", raw: ["12"] },
  { product: "PTCL 16 GR", asset: "ANRITSU57-4", raw: ["47", "48"] },

  { product: "250 GR-RC", asset: "OMRONG-1", raw: ["1", "5"] },
  { product: "250 GR-RC", asset: "ANRITSU64-4", raw: ["0", "1"] },
  { product: "250 GR-RC", asset: "OMRONM-1", raw: ["1"] },
  { product: "250 GR-RC", asset: "ANRITSU64-5", raw: ["2", "17", "18"] },
  { product: "250 GR-RC", asset: "OMRONM-2", raw: ["1"] },
  { product: "250 GR-RC", asset: "ANRITSU64-2", raw: ["3", "6"] },
  { product: "250 GR-RC", asset: "OMRONM-3", raw: ["1"] },
  { product: "250 GR-RC", asset: "ANRITSU62-7", raw: ["2", "11", "16"] },
  { product: "250 GR-RC", asset: "ANRITSU57-6", raw: ["14"] },
  { product: "250 GR-RC", asset: "MITSUF-3", raw: ["2"] },
  { product: "250 GR-RC", asset: "ANRITSU64-3", raw: ["2", "9"] },
  { product: "250 GR-RC", asset: "MITSUF-1", raw: ["3"] },
  { product: "250 GR-RC", asset: "ANRITSU64-1", raw: ["2"] },
  { product: "250 GR-RC", asset: "MITSUF-2", raw: ["3"] },
  { product: "250 GR-RC", asset: "ANRITSU57-5", raw: ["9", "14"] },

  { product: "250 GR-LC", asset: "MITSUF-3", raw: ["4"] },
  { product: "250 GR-LC", asset: "ANRITSU64-3", raw: ["3"] },
  { product: "250 GR-LC", asset: "MITSUF-1", raw: ["4"] },
  { product: "250 GR-LC", asset: "ANRITSU64-1", raw: ["3", "19"] },

  { product: "500 GR-LC", asset: "MITSUF-3", raw: ["5"] },
  { product: "500 GR-LC", asset: "ANRITSU64-3", raw: ["6"] },
  { product: "500 GR-LC", asset: "MITSUF-1", raw: ["8"] },
  { product: "500 GR-LC", asset: "ANRITSU64-1", raw: ["6"] },

  { product: "KGRC", asset: "MITSUF-3", raw: ["3"] },
  { product: "KGRC", asset: "ANRITSU64-3", raw: ["4"] },
  { product: "KGRC", asset: "MITSUF-1", raw: ["9"] },
  { product: "KGRC", asset: "ANRITSU64-1", raw: ["5", "13", "100"] },

  { product: "KGLC", asset: "MITSUF-3", raw: ["6"] },
  { product: "KGLC", asset: "ANRITSU64-3", raw: ["5"] },
  { product: "KGLC", asset: "MITSUF-1", raw: ["10"] },
  { product: "KGLC", asset: "ANRITSU64-1", raw: ["4", "21", "110"] },

  { product: "AP 120 GR", asset: "MITSUF-1", raw: ["12", "13"] },
  { product: "AP 120 GR", asset: "ANRITSU64-1", raw: ["1"] },

  { product: "250 GR-RC EXP", asset: "MITSUF-1", raw: ["3"] },
  { product: "250 GR-RC EXP", asset: "ANRITSU64-1", raw: ["10", "11"] },
  { product: "KGLC EXP", asset: "MITSUF-1", raw: ["9"] },
  { product: "KGLC EXP", asset: "ANRITSU64-1", raw: ["14"] },
  { product: "KGRC EXP", asset: "MITSUF-1", raw: ["10"] },
  { product: "KGRC EXP", asset: "ANRITSU64-1", raw: ["12"] },
  // Line 9 carton checkweigher. The sheet's Karton cell is that weigher's code.
  { product: "250 GR-RC", asset: "ANRITSU58-3", raw: ["14"] },
  { product: "250 GR-LC", asset: "ANRITSU58-3", raw: ["15"] },
  { product: "500 GR-LC", asset: "ANRITSU58-3", raw: ["19"] },
  { product: "KGRC", asset: "ANRITSU58-3", raw: ["20"] },
  { product: "KGLC", asset: "ANRITSU58-3", raw: ["21"] },
  { product: "AP 120 GR", asset: "ANRITSU58-3", raw: ["3"] },
  { product: "250 GR-RC EXP", asset: "ANRITSU58-3", raw: ["54"] },
  { product: "KGLC EXP", asset: "ANRITSU58-3", raw: ["24"] },

  { product: "100 GR", asset: "OMRONM-4", raw: ["1"] },
  { product: "100 GR", asset: "YAMATO-10", raw: ["1"] },
  { product: "100 GR", asset: "ANRITSU 57-8", raw: ["9", "0"] },
  { product: "100 GR 12-LC EXP", asset: "YAMATO-10", raw: ["2"] },
  { product: "100 GR 12-RC EXP", asset: "YAMATO-10", raw: ["2"] },
  { product: "100 GR 18-LC EXP", asset: "YAMATO-10", raw: ["2"] },
  { product: "100 GR 18-LC EXP", asset: "ANRITSU 57-8", raw: ["15"] },
  { product: "100 GR 18-RC EXP", asset: "YAMATO-10", raw: ["2"] },
  { product: "100 GR 18-RC EGYPT EXP", asset: "YAMATO-10", raw: ["2"] },
  { product: "100 GR 18-RC EGYPT EXP", asset: "ANRITSU 57-8", raw: ["15"] },

  { product: "AJPKG", asset: "MITSUF-2", raw: ["12", "41"] },
  { product: "AJPKG", asset: "YAMATO-5", raw: ["3"] },
  { product: "AJPKG", asset: "ANRITSU57-5", raw: ["25", "59"] },
  { product: "AJP 200 GR", asset: "MITSUF-2", raw: ["17"] },
  { product: "AJP 200 GR", asset: "YAMATO-5", raw: ["4"] },
  { product: "AJP 200 GR", asset: "ANRITSU57-5", raw: ["43"] },
  { product: "APKG", asset: "MITSUF-2", raw: ["14", "27", "40"] },
  { product: "APKG", asset: "YAMATO-5", raw: ["1"] },
  { product: "APKG", asset: "ANRITSU57-5", raw: ["22"] },
  { product: "KGAE", asset: "MITSUF-2", raw: ["15"] },
  { product: "KGAE", asset: "ANRITSU57-5", raw: ["29"] },
];

export function productId(code: string): string {
  return `prd-${code.trim().toLowerCase().replace(/\s+/g, "-")}`;
}

/** The mid-pack this SKU converts through, when it has one. */
export function skuMid(code: string): Mid | null {
  return SKUS.find((sku) => sku.code === code)?.mid?.unit ?? null;
}

function pouchesPerCarton(sku: Sku): number {
  return sku.mid ? sku.mid.count * sku.carton : sku.carton;
}

/**
 * Demo gross envelope for a bigger unit (inner, carton) — the sheet's own
 * envelopes are not in this file. Shaped like the PRD's worked example
 * (PRO-002 AC-12): contents × count plus a 2% box, so the value visibly
 * diverges from factor × per-piece and nothing warns or blocks on it.
 */
function demoEnvelope(count: number, pouch: Sku["pouch"]): Sku["pouch"] {
  const gross = (g: number) => Math.round(g * count * 1.02 * 1000) / 1000;
  return [gross(pouch[0]), gross(pouch[1]), gross(pouch[2])];
}

function measurementFields(envelope: Sku["pouch"]): {
  minWeight: number;
  standardWeight: number;
  maxWeight: number;
} {
  return { minWeight: envelope[0], standardWeight: envelope[1], maxWeight: envelope[2] };
}

function tagId(assetTag: string): string {
  return `tag-${assetKey(assetTag).toLowerCase()}-product_code`;
}

/** One raw value on one asset maps to one product. A value claimed by two SKUs is stored for neither. */
function acceptedLinks(): {
  kept: Array<{ product: string; asset: string; raw: string }>;
  skipped: string[];
} {
  const claims = new Map<string, { asset: string; raw: string; products: Set<string> }>();
  const skipped: string[] = [];
  for (const link of LINKS) {
    if (!gatewayIdForAsset(link.asset)) {
      skipped.push(`${link.asset} has no Product_Code tag`);
      continue;
    }
    for (const raw of link.raw) {
      const key = `${assetKey(link.asset)}|${raw}`;
      const claim = claims.get(key) ?? { asset: link.asset, raw, products: new Set<string>() };
      claim.products.add(link.product);
      claims.set(key, claim);
    }
  }
  const kept: Array<{ product: string; asset: string; raw: string }> = [];
  for (const claim of claims.values()) {
    const products = [...claim.products];
    if (products.length > 1) {
      skipped.push(`${claim.asset} code ${claim.raw} is claimed by ${products.join(", ")}`);
      continue;
    }
    const product = products[0];
    if (!product) continue;
    kept.push({ product, asset: claim.asset, raw: claim.raw });
  }
  return { kept, skipped };
}

export async function seedFi2Products(
  db: NodePgDatabase,
  region: string,
  tenantId: string,
): Promise<void> {
  for (const sku of SKUS) {
    if (sku.code.length > 30) throw new Error(`product code too long: ${sku.code}`);
    const [min, std, max] = sku.pouch;
    if (!(min <= std && std <= max)) throw new Error(`weight out of order: ${sku.code}`);
    if (pouchesPerCarton(sku) <= 0) throw new Error(`empty conversion: ${sku.code}`);
  }

  await db
    .delete(assetProductCodeTable)
    .where(
      and(
        eq(assetProductCodeTable.tenantId, tenantId),
        like(assetProductCodeTable.productId, "prd-%"),
      ),
    );
  await db
    .delete(productUomConversionTable)
    .where(
      and(
        eq(productUomConversionTable.tenantId, tenantId),
        like(productUomConversionTable.productId, "prd-%"),
      ),
    );
  await db
    .delete(productUomMeasurementTable)
    .where(
      and(
        eq(productUomMeasurementTable.tenantId, tenantId),
        like(productUomMeasurementTable.productId, "prd-%"),
      ),
    );
  await db
    .delete(productDetailTable)
    .where(
      and(eq(productDetailTable.tenantId, tenantId), like(productDetailTable.productId, "prd-%")),
    );
  await db
    .delete(productTable)
    .where(and(eq(productTable.tenantId, tenantId), like(productTable.id, "prd-%")));
  await db
    .delete(unitOfMeasurementTable)
    .where(
      and(
        eq(unitOfMeasurementTable.tenantId, tenantId),
        inArray(unitOfMeasurementTable.id, [
          PCS,
          INNER,
          CAL,
          CTN,
          GRAM,
          "uom-kg",
          "uom-mm",
          "uom-cm",
          "uom-m",
        ]),
      ),
    );
  await db.delete(measurementGroupTable).where(
    and(
      eq(measurementGroupTable.tenantId, tenantId),
      inArray(
        measurementGroupTable.id,
        MEASUREMENT_GROUPS.map((g) => g.id),
      ),
    ),
  );

  // F-05 §9.4: measurement groups are a controlled list with no screen to add
  // one, so every seed group is written — without "length" the product
  // dimension-unit picker (PRO-002 rule 2) has nothing to offer.
  await db
    .insert(measurementGroupTable)
    .values(MEASUREMENT_GROUPS.map((g) => ({ ...g, region, tenantId, validFrom: VALID_FROM })));
  await db.insert(unitOfMeasurementTable).values([
    {
      id: PCS,
      region,
      tenantId,
      code: "PCS",
      name: "Piece",
      unit: "pcs",
      measurementGroupId: "mg-count",
    },
    {
      id: INNER,
      region,
      tenantId,
      code: "INNER",
      name: "Inner",
      unit: "inner",
      measurementGroupId: "mg-count",
    },
    {
      id: CAL,
      region,
      tenantId,
      code: "CAL",
      name: "Calendar",
      unit: "cal",
      measurementGroupId: "mg-count",
    },
    {
      id: CTN,
      region,
      tenantId,
      code: "CTN",
      name: "Carton",
      unit: "ctn",
      measurementGroupId: "mg-count",
    },
    {
      id: GRAM,
      region,
      tenantId,
      code: "G",
      name: "Gram",
      unit: "g",
      measurementGroupId: "mg-mass",
    },
    {
      id: "uom-kg",
      region,
      tenantId,
      code: "KG",
      name: "Kilogram",
      unit: "kg",
      measurementGroupId: "mg-mass",
    },
    // Length units for product dimensions (PRO-002 rule 2: mm, cm, m).
    {
      id: "uom-mm",
      region,
      tenantId,
      code: "MM",
      name: "Millimetre",
      unit: "mm",
      measurementGroupId: "mg-length",
    },
    {
      id: "uom-cm",
      region,
      tenantId,
      code: "CM",
      name: "Centimetre",
      unit: "cm",
      measurementGroupId: "mg-length",
    },
    {
      id: "uom-m",
      region,
      tenantId,
      code: "M",
      name: "Metre",
      unit: "m",
      measurementGroupId: "mg-length",
    },
  ]);

  await db.insert(productTable).values(
    SKUS.map((sku) => ({
      id: productId(sku.code),
      region,
      tenantId,
      code: sku.code,
      name: sku.name,
      productType: "finished_good" as const,
      packagingLevel: null,
      baseUomId: PCS,
      validFrom: VALID_FROM,
    })),
  );

  await db.insert(productDetailTable).values(
    SKUS.map((sku) => ({
      id: `det-${productId(sku.code)}`,
      region,
      tenantId,
      productId: productId(sku.code),
      // PRO-002 (per-unit measurement, 2026-10-05): the envelope and
      // dimensions live on product_uom_measurement rows; this row keeps the
      // mass unit every measurement value is in.
      weightUomId: GRAM,
      isBatchTracked: false,
      validFrom: VALID_FROM,
    })),
  );

  // One measurement row per unit the SKU is handled in (PRO-002 rule 1 /
  // AC-10): the pouch (base unit) from the sheet, plus the inner/calendar and
  // the carton with demo gross envelopes.
  await db.insert(productUomMeasurementTable).values(
    SKUS.flatMap((sku) => {
      const rows = [
        {
          id: `meas-${productId(sku.code)}-pcs`,
          region,
          tenantId,
          productId: productId(sku.code),
          uomId: PCS,
          minWeight: sku.pouch[0],
          standardWeight: sku.pouch[1],
          maxWeight: sku.pouch[2],
          validFrom: VALID_FROM,
        },
        {
          id: `meas-${productId(sku.code)}-ctn`,
          region,
          tenantId,
          productId: productId(sku.code),
          uomId: CTN,
          ...measurementFields(demoEnvelope(pouchesPerCarton(sku), sku.pouch)),
          validFrom: VALID_FROM,
        },
      ];
      if (sku.mid) {
        rows.push({
          id: `meas-${productId(sku.code)}-${sku.mid.unit}`,
          region,
          tenantId,
          productId: productId(sku.code),
          uomId: sku.mid.unit === "inner" ? INNER : CAL,
          ...measurementFields(demoEnvelope(sku.mid.count, sku.pouch)),
          validFrom: VALID_FROM,
        });
      }
      return rows;
    }),
  );

  const conversions = SKUS.flatMap((sku) => {
    const rows = [
      {
        id: `uom-${productId(sku.code)}-ctn`,
        region,
        tenantId,
        productId: productId(sku.code),
        fromUomId: CTN,
        toUomId: PCS,
        conversionValue: pouchesPerCarton(sku),
        validFrom: VALID_FROM,
      },
    ];
    if (sku.mid) {
      rows.push({
        id: `uom-${productId(sku.code)}-${sku.mid.unit}`,
        region,
        tenantId,
        productId: productId(sku.code),
        fromUomId: sku.mid.unit === "inner" ? INNER : CAL,
        toUomId: PCS,
        conversionValue: sku.mid.count,
        validFrom: VALID_FROM,
      });
    }
    return rows;
  });
  await db.insert(productUomConversionTable).values(conversions);

  const { kept, skipped } = acceptedLinks();
  if (kept.length) {
    await db.insert(assetProductCodeTable).values(
      kept.map((link) => ({
        id: `apc-${assetKey(link.asset).toLowerCase()}-${link.raw}-${productId(link.product).slice(4)}`,
        region,
        tenantId,
        tagId: tagId(link.asset),
        rawValue: link.raw,
        productId: productId(link.product),
        validFrom: `${VALID_FROM}T00:00:00Z`,
      })),
    );
  }

  const uniqueSkips = [...new Set(skipped)];
  console.log(
    `Seeded ${SKUS.length} finished goods, ${conversions.length} conversions, ${kept.length} product codes. Skipped ${uniqueSkips.length} code claims.`,
  );
  for (const line of uniqueSkips) console.log(`  skip: ${line}`);
}
