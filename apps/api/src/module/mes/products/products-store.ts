import { sameCode } from "../../../shared/util/code-match.js";

import type {
  Product,
  ProductDetail,
  ProductUomConversion,
  ProductUomMeasurement,
} from "./products.js";
import type { ProductPatch, ProductsReader, ProductsWriter } from "./products-repository.js";

/** In-memory stand-in for unit tests. The API registers the database repositories. */
class ProductsStore implements ProductsReader, ProductsWriter {
  products: Product[] = [
    {
      id: "prod-1",
      code: "RM-FLOUR",
      name: "Wheat Flour",
      productType: "raw_material",
      baseUomId: "uom-2", // kg
    },
    {
      id: "prod-2",
      code: "SF-DOUGH",
      name: "Mixed Dough",
      productType: "semi_finished",
      baseUomId: "uom-2", // kg
    },
    {
      id: "prod-3",
      code: "FG-BREAD-500",
      name: "White Bread 500g",
      productType: "finished_good",
      baseUomId: "uom-5", // pack
    },
  ];

  details: ProductDetail[] = [
    {
      productId: "prod-3",
      weightUomId: "uom-3", // g
      // No dimension unit: no measurement row has dimensions yet (rule 2).
      dimensionUomId: null,
      barcode: "8991234500031",
      isBatchTracked: true,
      shelfLifeDays: 5,
      validFrom: "2026-01-01",
      validTo: null,
    },
  ];

  // PRO-002 (per-unit measurement, PO 2026-10-05): one row per unit the
  // product is handled in — base unit (pack) plus every conversion unit
  // (carton). Gross, declared: the carton is not 12 × the pack (rule 7).
  measurements: ProductUomMeasurement[] = [
    {
      id: "meas-1",
      productId: "prod-3",
      uomId: "uom-5", // pack
      minWeight: 480,
      standardWeight: 500,
      maxWeight: 520,
      validFrom: "2026-01-01",
      validTo: null,
    },
    {
      id: "meas-2",
      productId: "prod-3",
      uomId: "uom-6", // carton
      minWeight: 6000,
      standardWeight: 6150,
      maxWeight: 6300,
      validFrom: "2026-01-01",
      validTo: null,
    },
  ];

  // "1 carton = 12 pack" (PRD-003 WMS-003 / KPI-002 example): from carton to
  // pack, × 12 forward, ÷ 12 read backward. uom-5 = pack, uom-6 = carton.
  conversions: ProductUomConversion[] = [
    {
      id: "conv-1",
      productId: "prod-3",
      fromUomId: "uom-6",
      toUomId: "uom-5",
      conversionValue: 12,
      validFrom: "2026-01-01",
      validTo: null,
    },
  ];

  listProducts(): Promise<Product[]> {
    return Promise.resolve([...this.products]);
  }

  getProduct(id: string): Promise<Product | undefined> {
    return Promise.resolve(this.products.find((p) => p.id === id));
  }

  findByCode(code: string): Promise<Product | undefined> {
    // PRD-003 P-8 / PRO-001 AC-15: only active products hold a code.
    const today = new Date().toISOString().slice(0, 10);
    return Promise.resolve(
      this.products.find((p) => (p.validTo == null || p.validTo > today) && sameCode(p.code, code)),
    );
  }

  listDetailsByProduct(productId: string): Promise<ProductDetail[]> {
    return Promise.resolve(this.details.filter((d) => d.productId === productId));
  }

  listActiveDetails(): Promise<ProductDetail[]> {
    return Promise.resolve(this.details.filter((d) => d.validTo == null));
  }

  findActiveBarcode(barcode: string, excludeProductId: string): Promise<ProductDetail | undefined> {
    return Promise.resolve(
      this.details.find(
        (d) => d.validTo == null && d.barcode === barcode && d.productId !== excludeProductId,
      ),
    );
  }

  listMeasurementsByProduct(productId: string): Promise<ProductUomMeasurement[]> {
    return Promise.resolve(this.measurements.filter((m) => m.productId === productId));
  }

  listActiveMeasurements(): Promise<ProductUomMeasurement[]> {
    return Promise.resolve(this.measurements.filter((m) => m.validTo == null));
  }

  listConversions(): Promise<ProductUomConversion[]> {
    return Promise.resolve([...this.conversions]);
  }

  listConversionsByProduct(productId: string): Promise<ProductUomConversion[]> {
    return Promise.resolve(this.conversions.filter((c) => c.productId === productId));
  }

  getConversion(id: string): Promise<ProductUomConversion | undefined> {
    return Promise.resolve(this.conversions.find((c) => c.id === id));
  }

  findActiveConversion(
    productId: string,
    fromUomId: string,
    toUomId: string,
  ): Promise<ProductUomConversion | undefined> {
    return Promise.resolve(
      this.conversions.find(
        (c) =>
          c.validTo == null &&
          c.productId === productId &&
          c.fromUomId === fromUomId &&
          c.toUomId === toUomId,
      ),
    );
  }

  insertProduct(row: Product): Promise<Product> {
    this.products.unshift(row);
    return Promise.resolve(row);
  }

  updateProduct(id: string, patch: ProductPatch): Promise<Product | undefined> {
    const row = this.products.find((p) => p.id === id);
    if (!row) return Promise.resolve(undefined);
    Object.assign(row, patch);
    return Promise.resolve(row);
  }

  closeActiveDetails(productId: string, validTo: string): Promise<void> {
    for (const detail of this.details) {
      if (detail.productId === productId && detail.validTo == null) detail.validTo = validTo;
    }
    return Promise.resolve();
  }

  insertDetail(row: ProductDetail): Promise<ProductDetail> {
    this.details.push(row);
    return Promise.resolve(row);
  }

  closeActiveMeasurements(productId: string, uomId: string, validTo: string): Promise<void> {
    for (const row of this.measurements) {
      if (row.productId === productId && row.uomId === uomId && row.validTo == null) {
        row.validTo = validTo;
      }
    }
    return Promise.resolve();
  }

  insertMeasurement(row: ProductUomMeasurement): Promise<ProductUomMeasurement> {
    this.measurements.push(row);
    return Promise.resolve(row);
  }

  closeConversion(id: string, validTo: string): Promise<ProductUomConversion | undefined> {
    const row = this.conversions.find((c) => c.id === id);
    if (!row) return Promise.resolve(undefined);
    row.validTo = validTo;
    return Promise.resolve(row);
  }

  insertConversion(row: ProductUomConversion): Promise<ProductUomConversion> {
    this.conversions.push(row);
    return Promise.resolve(row);
  }
}

export { ProductsStore };
