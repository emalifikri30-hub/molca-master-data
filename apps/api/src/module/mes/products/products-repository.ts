import { and, asc, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { ulid } from "ulidx";

import {
  productDetailTable,
  productTable,
  productUomConversionTable,
  productUomMeasurementTable,
} from "../../../shared/database/schema/schema.js";

import { captureWrite, currentAudit } from "../../../shared/audit/audit-context.js";
import { currentTenantId } from "../../../shared/tenant/tenant-context.js";
import { connection } from "../../../shared/database/transaction.js";
import { assertLinksInTenant } from "../../../shared/database/tenant-links.js";

import type { PostgresDB } from "../../../shared/database/postgres.js";
import type {
  Product,
  ProductDetail,
  ProductUomConversion,
  ProductUomMeasurement,
} from "./products.js";

type ProductPatch = Partial<Omit<Product, "id" | "code">>;

type ProductsReader = {
  listProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  findByCode(code: string): Promise<Product | undefined>;
  listDetailsByProduct(productId: string): Promise<ProductDetail[]>;
  listActiveDetails(): Promise<ProductDetail[]>;
  findActiveBarcode(barcode: string, excludeProductId: string): Promise<ProductDetail | undefined>;
  listMeasurementsByProduct(productId: string): Promise<ProductUomMeasurement[]>;
  listActiveMeasurements(): Promise<ProductUomMeasurement[]>;
  listConversions(): Promise<ProductUomConversion[]>;
  listConversionsByProduct(productId: string): Promise<ProductUomConversion[]>;
  getConversion(id: string): Promise<ProductUomConversion | undefined>;
  findActiveConversion(
    productId: string,
    fromUomId: string,
    toUomId: string,
  ): Promise<ProductUomConversion | undefined>;
};

type ProductsWriter = {
  insertProduct(row: Product): Promise<Product>;
  updateProduct(id: string, patch: ProductPatch): Promise<Product | undefined>;
  closeActiveDetails(productId: string, validTo: string): Promise<void>;
  insertDetail(row: ProductDetail): Promise<ProductDetail>;
  closeActiveMeasurements(productId: string, uomId: string, validTo: string): Promise<void>;
  insertMeasurement(row: ProductUomMeasurement): Promise<ProductUomMeasurement>;
  closeConversion(id: string, validTo: string): Promise<ProductUomConversion | undefined>;
  insertConversion(row: ProductUomConversion): Promise<ProductUomConversion>;
};

type ProductsRepositoryDeps = {
  db: PostgresDB;
  region: string;
};

function toProduct(row: {
  id: string;
  code: string;
  name: string;
  productType: string;
  packagingLevel: string | null;
  baseUomId: string;
  validFrom: string | null;
  validTo: string | null;
}): Product {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    productType: row.productType as Product["productType"],
    packagingLevel: (row.packagingLevel as Product["packagingLevel"]) ?? null,
    baseUomId: row.baseUomId,
    validFrom: row.validFrom,
    validTo: row.validTo,
  };
}

function toDetail(row: {
  productId: string;
  weightUomId: string | null;
  dimensionUomId: string | null;
  barcode: string | null;
  isBatchTracked: boolean;
  shelfLifeDays: number | null;
  validFrom: string | null;
  validTo: string | null;
}): ProductDetail {
  return {
    productId: row.productId,
    weightUomId: row.weightUomId,
    dimensionUomId: row.dimensionUomId ?? undefined,
    barcode: row.barcode ?? undefined,
    isBatchTracked: row.isBatchTracked,
    shelfLifeDays: row.shelfLifeDays ?? undefined,
    validFrom: row.validFrom ?? undefined,
    validTo: row.validTo,
  };
}

function toMeasurement(row: {
  id: string;
  productId: string;
  uomId: string;
  minWeight: number;
  maxWeight: number;
  standardWeight: number;
  length: number | null;
  width: number | null;
  height: number | null;
  validFrom: string | null;
  validTo: string | null;
}): ProductUomMeasurement {
  return {
    id: row.id,
    productId: row.productId,
    uomId: row.uomId,
    minWeight: row.minWeight,
    maxWeight: row.maxWeight,
    standardWeight: row.standardWeight,
    length: row.length ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    validFrom: row.validFrom ?? undefined,
    validTo: row.validTo,
  };
}

function toConversion(row: {
  id: string;
  productId: string;
  fromUomId: string;
  toUomId: string;
  conversionValue: number;
  validFrom: string | null;
  validTo: string | null;
}): ProductUomConversion {
  return {
    id: row.id,
    productId: row.productId,
    fromUomId: row.fromUomId,
    toUomId: row.toUomId,
    conversionValue: row.conversionValue,
    validFrom: row.validFrom ?? undefined,
    validTo: row.validTo,
  };
}

class ProductsReaderRepository implements ProductsReader {
  private db: PostgresDB;
  private region: string;

  constructor({ db, region }: ProductsRepositoryDeps) {
    this.db = db;
    this.region = region;
  }

  /** The open transaction when the caller runs inside `transact`, else the pool. */
  private get conn(): PostgresDB {
    return connection(this.db);
  }

  // Tenant-scoped like EntityRepository (F-00 rule 6).
  async listProducts(): Promise<Product[]> {
    const rows = await this.conn
      .select()
      .from(productTable)
      .where(
        and(eq(productTable.region, this.region), eq(productTable.tenantId, currentTenantId())),
      )
      .orderBy(asc(productTable.code));
    return rows.map(toProduct);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const rows = await this.conn
      .select()
      .from(productTable)
      .where(
        and(
          eq(productTable.region, this.region),
          eq(productTable.tenantId, currentTenantId()),
          eq(productTable.id, id),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toProduct(row) : undefined;
  }

  async findByCode(code: string): Promise<Product | undefined> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.conn
      .select()
      .from(productTable)
      .where(
        and(
          eq(productTable.region, this.region),
          eq(productTable.tenantId, currentTenantId()),
          // docs-molcadx#142: codes match ignoring case and surrounding spaces.
          sql`lower(btrim(${productTable.code})) = lower(btrim(${code}))`,
          // PRD-003 P-8 / PRO-001 AC-15 (PO 2026-10-21): only active products hold a code.
          or(isNull(productTable.validTo), gt(productTable.validTo, today)),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toProduct(row) : undefined;
  }

  async listDetailsByProduct(productId: string): Promise<ProductDetail[]> {
    const rows = await this.conn
      .select()
      .from(productDetailTable)
      .where(
        and(
          eq(productDetailTable.region, this.region),
          eq(productDetailTable.tenantId, currentTenantId()),
          eq(productDetailTable.productId, productId),
        ),
      );
    return rows.map(toDetail);
  }

  async listActiveDetails(): Promise<ProductDetail[]> {
    const rows = await this.conn
      .select()
      .from(productDetailTable)
      .where(
        and(
          eq(productDetailTable.region, this.region),
          eq(productDetailTable.tenantId, currentTenantId()),
          isNull(productDetailTable.validTo),
        ),
      );
    return rows.map(toDetail);
  }

  async findActiveBarcode(
    barcode: string,
    excludeProductId: string,
  ): Promise<ProductDetail | undefined> {
    const rows = await this.conn
      .select()
      .from(productDetailTable)
      .where(
        and(
          eq(productDetailTable.region, this.region),
          eq(productDetailTable.tenantId, currentTenantId()),
          eq(productDetailTable.barcode, barcode),
          ne(productDetailTable.productId, excludeProductId),
          isNull(productDetailTable.validTo),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toDetail(row) : undefined;
  }

  async listMeasurementsByProduct(productId: string): Promise<ProductUomMeasurement[]> {
    const rows = await this.conn
      .select()
      .from(productUomMeasurementTable)
      .where(
        and(
          eq(productUomMeasurementTable.region, this.region),
          eq(productUomMeasurementTable.tenantId, currentTenantId()),
          eq(productUomMeasurementTable.productId, productId),
        ),
      );
    return rows.map(toMeasurement);
  }

  async listActiveMeasurements(): Promise<ProductUomMeasurement[]> {
    const rows = await this.conn
      .select()
      .from(productUomMeasurementTable)
      .where(
        and(
          eq(productUomMeasurementTable.region, this.region),
          eq(productUomMeasurementTable.tenantId, currentTenantId()),
          isNull(productUomMeasurementTable.validTo),
        ),
      );
    return rows.map(toMeasurement);
  }

  async listConversions(): Promise<ProductUomConversion[]> {
    const rows = await this.conn
      .select()
      .from(productUomConversionTable)
      .where(
        and(
          eq(productUomConversionTable.region, this.region),
          eq(productUomConversionTable.tenantId, currentTenantId()),
        ),
      );
    return rows.map(toConversion);
  }

  async listConversionsByProduct(productId: string): Promise<ProductUomConversion[]> {
    const rows = await this.conn
      .select()
      .from(productUomConversionTable)
      .where(
        and(
          eq(productUomConversionTable.region, this.region),
          eq(productUomConversionTable.tenantId, currentTenantId()),
          eq(productUomConversionTable.productId, productId),
        ),
      );
    return rows.map(toConversion);
  }

  async getConversion(id: string): Promise<ProductUomConversion | undefined> {
    const rows = await this.conn
      .select()
      .from(productUomConversionTable)
      .where(
        and(
          eq(productUomConversionTable.region, this.region),
          eq(productUomConversionTable.tenantId, currentTenantId()),
          eq(productUomConversionTable.id, id),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toConversion(row) : undefined;
  }

  async findActiveConversion(
    productId: string,
    fromUomId: string,
    toUomId: string,
  ): Promise<ProductUomConversion | undefined> {
    const rows = await this.conn
      .select()
      .from(productUomConversionTable)
      .where(
        and(
          eq(productUomConversionTable.region, this.region),
          eq(productUomConversionTable.tenantId, currentTenantId()),
          eq(productUomConversionTable.productId, productId),
          eq(productUomConversionTable.fromUomId, fromUomId),
          eq(productUomConversionTable.toUomId, toUomId),
          isNull(productUomConversionTable.validTo),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toConversion(row) : undefined;
  }
}

class ProductsWriterRepository implements ProductsWriter {
  private db: PostgresDB;
  private region: string;

  constructor({ db, region }: ProductsRepositoryDeps) {
    this.db = db;
    this.region = region;
  }

  /** The open transaction when the caller runs inside `transact`, else the pool. */
  private get conn(): PostgresDB {
    return connection(this.db);
  }

  async insertProduct(row: Product): Promise<Product> {
    const values = {
      id: row.id,
      region: this.region,
      tenantId: currentTenantId(),
      code: row.code,
      name: row.name,
      productType: row.productType,
      packagingLevel: row.packagingLevel ?? null,
      baseUomId: row.baseUomId,
      validFrom: row.validFrom ?? null,
      validTo: row.validTo ?? null,
    };
    await assertLinksInTenant(this.conn, productTable, values);
    await this.conn.insert(productTable).values(values);
    captureWrite({ table: "product", kind: "insert", before: null, after: { ...row } });
    return row;
  }

  async updateProduct(id: string, patch: ProductPatch): Promise<Product | undefined> {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.productType !== undefined) values.productType = patch.productType;
    if (patch.packagingLevel !== undefined) values.packagingLevel = patch.packagingLevel;
    if (patch.baseUomId !== undefined) values.baseUomId = patch.baseUomId;
    if (patch.validTo !== undefined) values.validTo = patch.validTo;
    await assertLinksInTenant(this.conn, productTable, values);
    const before = currentAudit() ? await this.productRow(id) : undefined;
    const rows = await this.conn
      .update(productTable)
      .set(values as never)
      .where(
        and(
          eq(productTable.region, this.region),
          eq(productTable.tenantId, currentTenantId()),
          eq(productTable.id, id),
        ),
      )
      .returning();
    const row = rows[0];
    const after = row ? toProduct(row) : undefined;
    if (before && after) captureWrite({ table: "product", kind: "update", before, after });
    return after;
  }

  private async productRow(id: string): Promise<Product | undefined> {
    const rows = await this.conn
      .select()
      .from(productTable)
      .where(
        and(
          eq(productTable.region, this.region),
          eq(productTable.tenantId, currentTenantId()),
          eq(productTable.id, id),
        ),
      )
      .limit(1);
    return rows[0] ? toProduct(rows[0]) : undefined;
  }

  async closeActiveDetails(productId: string, validTo: string): Promise<void> {
    const closed = await this.conn
      .update(productDetailTable)
      .set({ validTo, updatedAt: new Date() })
      .where(
        and(
          eq(productDetailTable.region, this.region),
          eq(productDetailTable.tenantId, currentTenantId()),
          eq(productDetailTable.productId, productId),
          isNull(productDetailTable.validTo),
        ),
      )
      .returning();
    for (const row of closed) {
      const after = { ...toDetail(row), id: row.id };
      captureWrite({
        table: "product_detail",
        kind: "update",
        before: { ...after, validTo: null },
        after,
      });
    }
  }

  async insertDetail(row: ProductDetail): Promise<ProductDetail> {
    const id = ulid();
    const values = {
      id,
      region: this.region,
      tenantId: currentTenantId(),
      productId: row.productId,
      weightUomId: row.weightUomId,
      dimensionUomId: row.dimensionUomId ?? null,
      barcode: row.barcode ?? null,
      isBatchTracked: row.isBatchTracked,
      shelfLifeDays: row.shelfLifeDays ?? null,
      validFrom: row.validFrom ?? null,
      validTo: row.validTo ?? null,
    };
    await assertLinksInTenant(this.conn, productDetailTable, values);
    await this.conn.insert(productDetailTable).values(values);
    captureWrite({ table: "product_detail", kind: "insert", before: null, after: { ...row, id } });
    return row;
  }

  async closeActiveMeasurements(productId: string, uomId: string, validTo: string): Promise<void> {
    const closed = await this.conn
      .update(productUomMeasurementTable)
      .set({ validTo, updatedAt: new Date() })
      .where(
        and(
          eq(productUomMeasurementTable.region, this.region),
          eq(productUomMeasurementTable.tenantId, currentTenantId()),
          eq(productUomMeasurementTable.productId, productId),
          eq(productUomMeasurementTable.uomId, uomId),
          isNull(productUomMeasurementTable.validTo),
        ),
      )
      .returning();
    for (const row of closed) {
      const after = toMeasurement(row);
      captureWrite({
        table: "product_uom_measurement",
        kind: "update",
        before: { ...after, validTo: null },
        after,
      });
    }
  }

  async insertMeasurement(row: ProductUomMeasurement): Promise<ProductUomMeasurement> {
    const values = {
      id: row.id,
      region: this.region,
      tenantId: currentTenantId(),
      productId: row.productId,
      uomId: row.uomId,
      minWeight: row.minWeight,
      maxWeight: row.maxWeight,
      standardWeight: row.standardWeight,
      length: row.length ?? null,
      width: row.width ?? null,
      height: row.height ?? null,
      validFrom: row.validFrom ?? null,
      validTo: row.validTo ?? null,
    };
    await assertLinksInTenant(this.conn, productUomMeasurementTable, values);
    await this.conn.insert(productUomMeasurementTable).values(values);
    captureWrite({
      table: "product_uom_measurement",
      kind: "insert",
      before: null,
      after: { ...row },
    });
    return row;
  }

  async closeConversion(id: string, validTo: string): Promise<ProductUomConversion | undefined> {
    const rows = await this.conn
      .update(productUomConversionTable)
      .set({ validTo, updatedAt: new Date() })
      .where(
        and(
          eq(productUomConversionTable.region, this.region),
          eq(productUomConversionTable.tenantId, currentTenantId()),
          eq(productUomConversionTable.id, id),
        ),
      )
      .returning();
    const row = rows[0];
    const after = row ? toConversion(row) : undefined;
    if (after) {
      captureWrite({
        table: "product_uom_conversion",
        kind: "update",
        before: { ...after, validTo: null },
        after,
      });
    }
    return after;
  }

  async insertConversion(row: ProductUomConversion): Promise<ProductUomConversion> {
    const values = {
      id: row.id,
      region: this.region,
      tenantId: currentTenantId(),
      productId: row.productId,
      fromUomId: row.fromUomId,
      toUomId: row.toUomId,
      conversionValue: row.conversionValue,
      validFrom: row.validFrom ?? null,
      validTo: row.validTo ?? null,
    };
    await assertLinksInTenant(this.conn, productUomConversionTable, values);
    await this.conn.insert(productUomConversionTable).values(values);
    captureWrite({
      table: "product_uom_conversion",
      kind: "insert",
      before: null,
      after: { ...row },
    });
    return row;
  }
}

export { ProductsReaderRepository, ProductsWriterRepository };
export type { ProductsReader, ProductsWriter, ProductPatch };
