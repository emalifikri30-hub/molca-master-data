import { ulid } from "ulidx";

import { refusal } from "../../../shared/errors/refusal.js";
import { planningUnreachable } from "../../planning/planning-error.js";
import { round6 } from "./uom-conversion.js";

import type { PlanningClientContract } from "@molca/contract-client";
import type { ReferenceDataStore } from "../reference-data/reference-data-store.js";
import type { TWorkMasterService } from "../work-master/work-master-service.js";
import type {
  Product,
  ProductDetail,
  ProductUomConversion,
  ProductUomMeasurement,
} from "./products.js";
import type { ProductsReader, ProductsWriter } from "./products-repository.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const active = (r: { validTo?: string | null }) => r.validTo == null;

/** PRO-002 AC-13: volume = length × width × height — derived, never entered. */
function withVolume(row: ProductUomMeasurement): ProductUomMeasurement {
  const { length, width, height } = row;
  const volume =
    length !== undefined && width !== undefined && height !== undefined
      ? round6(length * width * height)
      : undefined;
  return { ...row, volume };
}

/** PRO-002 rule 2: a row "has dimensions" when any of the three is set. */
function hasDimensions(row: { length?: number; width?: number; height?: number }): boolean {
  return row.length !== undefined || row.width !== undefined || row.height !== undefined;
}

/** What the Measurement tab saves for one unit (PRO-002 rule 2/3). */
type MeasurementInput = {
  uomId: string;
  minWeight: number;
  standardWeight: number;
  maxWeight: number;
  length?: number;
  width?: number;
  height?: number;
};

/** PRO-002 (docs-molcadx#125): the product-level fields the product Edit modal saves. */
type ProductDetailsInput = {
  isBatchTracked: boolean;
  barcode?: string;
  shelfLifeDays?: number;
  // PO 2026-10-10: units in the Edit modal. Undefined carries the current unit over.
  weightUomId?: string | null;
  dimensionUomId?: string | null;
};

/** The part of Planning's `/job-orders/executions` the closure check reads: work orders only. */
type PlanningWorkOrder = { id: string; woNumber: string; productId: string; status: string };

// PRO-001 rule 5: a work order still references its product until it is finished.
const OPEN_WORK_ORDER = new Set(["draft", "released", "in_progress", "on_hold"]);

type ProductsServiceDeps = {
  planningClient: PlanningClientContract;
  productsReaderRepository: ProductsReader;
  productsWriterRepository: ProductsWriter;
  workMasterService: TWorkMasterService;
  referenceDataStore: ReferenceDataStore;
};

/**
 * PRO-001 rule 2 / AC-10–11: a packaging product needs a level, any other
 * type has none.
 */
function checkPackagingLevel(row: Pick<Product, "productType" | "packagingLevel">) {
  if (row.productType === "packaging" && !row.packagingLevel) {
    throw refusal(422, "packaging_level_missing");
  }
  if (row.productType !== "packaging" && row.packagingLevel) {
    throw refusal(422, "packaging_level_not_allowed");
  }
}

class ProductsService {
  private reader: ProductsReader;
  private writer: ProductsWriter;
  private workMaster: TWorkMasterService;
  private reference: ReferenceDataStore;
  private planning: PlanningClientContract;

  constructor({
    planningClient,
    productsReaderRepository,
    productsWriterRepository,
    workMasterService,
    referenceDataStore,
  }: ProductsServiceDeps) {
    this.planning = planningClient;
    this.reader = productsReaderRepository;
    this.writer = productsWriterRepository;
    this.workMaster = workMasterService;
    this.reference = referenceDataStore;
  }

  async list(): Promise<Product[]> {
    const rows = await this.reader.listProducts();
    return rows.sort((a, b) => a.code.localeCompare(b.code));
  }

  async get(id: string): Promise<Product> {
    const row = await this.reader.getProduct(id);
    if (!row) throw refusal(404, "not_found");
    return row;
  }

  /** PRO-001 AC-2: codes are unique, naming the holder (docs-molcadx#142: case and surrounding spaces ignored). */
  async create(input: Omit<Product, "id" | "validFrom" | "validTo">): Promise<Product> {
    const holder = await this.reader.findByCode(input.code);
    if (holder) throw refusal(409, "code_taken", { holderCode: holder.code, name: holder.name });
    checkPackagingLevel(input);
    const row: Product = {
      ...input,
      packagingLevel: input.packagingLevel ?? null,
      id: ulid(),
      validFrom: today(),
      validTo: null,
    };
    return this.writer.insertProduct(row);
  }

  /**
   * PRO-001 AC-7 (not built, deferred): the base unit locks once output is
   * recorded. Output lives in PRODUCTION and isn't captured yet, so this never
   * refuses today; the web already handles `base_unit_locked` for when it does.
   */
  async update(
    id: string,
    patch: Partial<Omit<Product, "id" | "code" | "validTo">>,
    details?: ProductDetailsInput,
  ): Promise<Product> {
    const row = await this.get(id);
    const next = { ...row, ...patch };
    // Switching away from packaging clears the level rather than refusing.
    if (patch.productType && patch.productType !== "packaging" && !("packagingLevel" in patch)) {
      next.packagingLevel = null;
    }
    checkPackagingLevel(next);
    // PRO-002 (PO 2026-10-10, docs-molcadx#125): batch tracked, barcode and
    // shelf life are saved with the product, one save and one reason. Every
    // refusal is checked before anything is written.
    const nextDetail = details ? await this.changedDetail(id, details) : null;
    const saved = await this.writer.updateProduct(id, {
      name: next.name,
      productType: next.productType,
      packagingLevel: next.packagingLevel ?? null,
      baseUomId: next.baseUomId,
    });
    if (!saved) throw refusal(404, "not_found");
    if (nextDetail) await this.versionDetail(nextDetail);
    return saved;
  }

  /**
   * PRO-002 rule 5 / AC-17: the PRODUCT_DETAIL row to open when any of the
   * product-level fields changed, or null when none did. An omitted unit
   * carries over the current row's unit.
   */
  private async changedDetail(
    productId: string,
    input: ProductDetailsInput,
  ): Promise<ProductDetail | null> {
    const current = await this.detail(productId);
    const barcode = input.barcode || undefined;
    // PO 2026-10-10: units in the Edit modal; "" means no unit.
    const weightUomId =
      input.weightUomId === undefined ? (current?.weightUomId ?? null) : input.weightUomId || null;
    const dimensionUomId =
      input.dimensionUomId === undefined
        ? (current?.dimensionUomId ?? null)
        : input.dimensionUomId || null;
    const same =
      (current?.isBatchTracked ?? false) === input.isBatchTracked &&
      (current?.barcode || undefined) === barcode &&
      current?.shelfLifeDays === input.shelfLifeDays &&
      (current?.weightUomId ?? null) === weightUomId &&
      (current?.dimensionUomId ?? null) === dimensionUomId;
    if (same) return null;
    await this.checkUnits(productId, weightUomId, dimensionUomId);
    await this.checkBarcode(productId, barcode);
    // Before any unit is measured there is no weight unit yet (PO 2026-10-10):
    // the first row opens without one.
    return {
      productId,
      weightUomId,
      dimensionUomId,
      barcode,
      isBatchTracked: input.isBatchTracked,
      shelfLifeDays: input.shelfLifeDays,
    };
  }

  /**
   * PRO-002 rule 2 / AC-9: the weight unit must be a mass unit, and is required
   * once the product has a measurement row (PO 2026-10-10: it may be empty
   * before any unit is measured). PRO-002 rule 2 (per-unit measurement,
   * 2026-10-05): the dimension unit is a length unit, and required when any
   * measurement row has dimensions.
   */
  private async checkUnits(
    productId: string,
    weightUomId: string | null,
    dimensionUomId: string | null,
  ): Promise<void> {
    const [units, groups] = await Promise.all([
      this.reference.listUnits(),
      this.reference.listGroups(),
    ]);
    const rows = (await this.reader.listMeasurementsByProduct(productId)).filter(active);
    const unit = units.find((u) => u.id === weightUomId);
    const group = groups.find((g) => g.id === unit?.measurementGroupId);
    if (weightUomId && !unit) throw refusal(422, "weight_unit_required");
    if (!unit && rows.length > 0) throw refusal(422, "weight_unit_required");
    if (unit && group?.code !== "mass") {
      throw refusal(422, "weight_unit_not_mass", { uomId: unit.id });
    }
    const dimensionUnit = units.find((u) => u.id === dimensionUomId);
    const dimensionGroup = groups.find((g) => g.id === dimensionUnit?.measurementGroupId);
    if (dimensionUnit && dimensionGroup?.code !== "length") {
      throw refusal(422, "dimension_unit_not_length", { uomId: dimensionUnit.id });
    }
    if (!dimensionUnit && rows.some((r) => hasDimensions(r))) {
      throw refusal(422, "dimension_unit_required");
    }
  }

  /** PRO-002 AC-7: a barcode is used by one active product only. */
  private async checkBarcode(productId: string, barcode: string | undefined): Promise<void> {
    if (!barcode) return;
    const holder = await this.reader.findActiveBarcode(barcode, productId);
    if (holder) throw refusal(409, "barcode_taken", { productId: holder.productId });
  }

  /** PRO-002 rule 5: close the row in force and open the next one. */
  private async versionDetail(next: ProductDetail): Promise<ProductDetail> {
    // Half-open versions (F-00, PO 2026-10-02): the old row ends where the new one starts.
    await this.writer.closeActiveDetails(next.productId, today());
    return this.writer.insertDetail({ ...next, validFrom: today(), validTo: null });
  }

  /**
   * PRO-001 rule 5 / AC-6: refused while an active BOM or routing, or an open
   * work order, references the product; the refusal names each one. Work
   * orders live in Planning: when it can't be asked, closing is refused —
   * never treated as "nothing uses it".
   */
  async close(id: string, validTo: string): Promise<Product> {
    await this.get(id);
    const now = today();
    const live = (v: { status: string; validTo: string | null }) =>
      v.status !== "retired" && (v.validTo === null || v.validTo > now);
    const blockers: Array<Record<string, unknown>> = [
      ...(await this.workMaster.data.readBoms())
        .filter(
          (b) =>
            live(b) && (b.productId === id || b.lines.some((l) => l.componentProductId === id)),
        )
        .map((b) => ({
          type: "bom",
          bomId: b.id,
          productId: b.productId,
          version: b.version,
          validFrom: b.validFrom,
        })),
      ...(await this.workMaster.data.readRoutings())
        .filter((r) => live(r) && r.productId === id)
        .map((r) => ({
          type: "routing",
          routingId: r.id,
          workCenterId: r.workCenterId,
          version: r.version,
          validFrom: r.validFrom,
        })),
      ...(await this.openWorkOrders(id)).map((w) => ({
        type: "work_order",
        workOrderId: w.id,
        woNumber: w.woNumber,
      })),
    ];
    if (blockers.length > 0) throw refusal(409, "closure_blocked", { blockers });
    const saved = await this.writer.updateProduct(id, { validTo });
    if (!saved) throw refusal(404, "not_found");
    return saved;
  }

  /** Planning's work orders of this product that are not finished yet. */
  private async openWorkOrders(productId: string): Promise<PlanningWorkOrder[]> {
    const payload = await this.planning.executions().catch((err: unknown) => {
      throw planningUnreachable(err);
    });
    return payload.workOrders
      .map(({ id, woNumber, productId, status }) => ({ id, woNumber, productId, status }))
      .filter((w) => w.productId === productId && OPEN_WORK_ORDER.has(w.status));
  }

  // PRODUCT_DETAIL — PRO-002 AC-6: a change closes the version in force.
  async detail(productId: string): Promise<ProductDetail | null> {
    const rows = await this.reader.listDetailsByProduct(productId);
    return rows.find(active) ?? null;
  }

  async detailVersions(productId: string): Promise<ProductDetail[]> {
    const rows = await this.reader.listDetailsByProduct(productId);
    return rows.sort((a, b) => (b.validFrom ?? "").localeCompare(a.validFrom ?? ""));
  }

  async allDetails(): Promise<ProductDetail[]> {
    return this.reader.listActiveDetails();
  }

  async upsertDetail(detail: ProductDetail): Promise<ProductDetail> {
    // An empty picker sends "": store "no unit" as null, never "".
    const input = {
      ...detail,
      weightUomId: detail.weightUomId || null,
      dimensionUomId: detail.dimensionUomId || null,
    };
    await this.checkUnits(input.productId, input.weightUomId, input.dimensionUomId);
    await this.checkBarcode(input.productId, input.barcode);
    return this.versionDetail(input);
  }

  // PRODUCT_UOM_MEASUREMENT — PRO-002 (per-unit measurement, PO 2026-10-05).
  // One row per unit the product is handled in: the base unit plus every unit
  // in its conversion rows, every unit its own row (rule 1 / AC-10).
  async measurements(productId: string): Promise<ProductUomMeasurement[]> {
    const rows = (await this.reader.listMeasurementsByProduct(productId)).filter(active);
    return rows.map(withVolume);
  }

  async measurementVersions(productId: string): Promise<ProductUomMeasurement[]> {
    const rows = await this.reader.listMeasurementsByProduct(productId);
    return rows
      .sort((a, b) => (b.validFrom ?? "").localeCompare(a.validFrom ?? ""))
      .map(withVolume);
  }

  async allMeasurements(): Promise<ProductUomMeasurement[]> {
    return (await this.reader.listActiveMeasurements()).map(withVolume);
  }

  /**
   * PRO-002 rule 5 / AC-6: a changed envelope or dimension closes the old row
   * and opens a new one, per (product, unit). Rule 2 / AC-2/AC-3: the order
   * minimum ≤ standard ≤ maximum is refused naming all three numbers. Rule 7:
   * values are declared gross — never derived from the conversion factor, so
   * there is no consistency check against it and nothing warns or blocks.
   */
  async upsertMeasurements(
    productId: string,
    inputs: ReadonlyArray<MeasurementInput>,
  ): Promise<ProductUomMeasurement[]> {
    await this.get(productId);
    const detail = await this.detail(productId);
    // Rule 2: the product's weight unit is required and in the mass group —
    // it is the unit every measurement value is in.
    const [units, groups] = await Promise.all([
      this.reference.listUnits(),
      this.reference.listGroups(),
    ]);
    const weightUnit = units.find((u) => u.id === detail?.weightUomId);
    const weightGroup = groups.find((g) => g.id === weightUnit?.measurementGroupId);
    if (!weightUnit || weightGroup?.code !== "mass") {
      throw refusal(422, "weight_unit_required");
    }
    const dimensionUnit = units.find((u) => u.id === detail?.dimensionUomId);
    const current = (await this.reader.listMeasurementsByProduct(productId)).filter(active);
    const saved: ProductUomMeasurement[] = [];
    for (const input of inputs) {
      const { minWeight: min, standardWeight: standard, maxWeight: max } = input;
      if (!(min <= standard && standard <= max)) {
        throw refusal(422, "weight_order", { min, standard, max });
      }
      // Rule 2: the dimension unit is required when a row has dimensions.
      if (hasDimensions(input) && !dimensionUnit) throw refusal(422, "dimension_unit_required");
      // A save re-versions only what moved (rule 5): a row whose values are
      // unchanged keeps its version.
      const unchanged = current.find(
        (m) =>
          m.uomId === input.uomId &&
          m.minWeight === input.minWeight &&
          m.standardWeight === input.standardWeight &&
          m.maxWeight === input.maxWeight &&
          (m.length ?? undefined) === input.length &&
          (m.width ?? undefined) === input.width &&
          (m.height ?? undefined) === input.height,
      );
      if (unchanged) {
        saved.push(unchanged);
        continue;
      }
      const row: ProductUomMeasurement = {
        ...input,
        id: ulid(),
        productId,
        validFrom: today(),
        validTo: null,
      };
      await this.writer.closeActiveMeasurements(productId, input.uomId, today());
      saved.push(await this.writer.insertMeasurement(row));
    }
    return saved.map(withVolume);
  }

  // PRODUCT_UOM_CONVERSION — PRO-003. One row covers both directions (rule 5).
  async allConversions(): Promise<ProductUomConversion[]> {
    return this.reader.listConversions();
  }

  async conversions(productId: string): Promise<ProductUomConversion[]> {
    return this.reader.listConversionsByProduct(productId);
  }

  async createConversion(
    input: Omit<ProductUomConversion, "id" | "validFrom" | "validTo">,
  ): Promise<ProductUomConversion> {
    if (input.fromUomId === input.toUomId) throw refusal(422, "same_unit");
    if (!(input.conversionValue > 0)) throw refusal(422, "factor_not_positive");
    input = { ...input, conversionValue: round6(input.conversionValue) };
    const existing = await this.reader.findActiveConversion(
      input.productId,
      input.fromUomId,
      input.toUomId,
    );
    if (existing) throw refusal(409, "duplicate_conversion", { existingId: existing.id });
    const row: ProductUomConversion = { ...input, id: ulid(), validFrom: today(), validTo: null };
    return this.writer.insertConversion(row);
  }

  /**
   * AC-8: a new factor closes the old row; old reports keep the old factor.
   * `valid_to` is exclusive for conversions (F-06 §9.4: active while
   * `valid_to > date`), so the old row ends the day the new one starts.
   */
  async updateConversion(id: string, conversionValue: number): Promise<ProductUomConversion> {
    const row = await this.reader.getConversion(id);
    if (!row) throw refusal(404, "not_found");
    if (!(conversionValue > 0)) throw refusal(422, "factor_not_positive");
    const started = today();
    await this.writer.closeConversion(id, started);
    const next: ProductUomConversion = {
      ...row,
      id: ulid(),
      conversionValue: round6(conversionValue),
      validFrom: started,
      validTo: null,
    };
    return this.writer.insertConversion(next);
  }
}

export { ProductsService };
export type {
  ProductsService as TProductsService,
  ProductsServiceDeps,
  ProductDetailsInput,
  MeasurementInput,
};
