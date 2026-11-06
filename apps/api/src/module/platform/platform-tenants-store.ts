import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { ulid } from "ulidx";

import {
  measurementGroupTable,
  tenantTable,
  unitOfMeasurementTable,
} from "../../shared/database/schema/schema.js";
import { MEASUREMENT_GROUPS } from "../mes/reference-data/measurement-groups.js";
import { SEED_UNITS } from "../mes/reference-data/seed-units.js";
import { codeKey } from "../../shared/util/code-match.js";
import { connection } from "../../shared/database/transaction.js";

import type { PostgresDB } from "../../shared/database/postgres.js";
import type { CreatePlatformTenant, PlatformTenant } from "./platform-tenants.js";

type Row = typeof tenantTable.$inferSelect;

const toTenant = (row: Row): PlatformTenant => ({
  tenantId: row.tenantId,
  tenantCode: row.tenantCode,
  tenantName: row.tenantName,
  validFrom: row.validFrom,
  validTo: row.validTo,
  createdAt: new Date(row.createdAt).toISOString(),
});

/**
 * The TENANT registry across tenants, for dx-platform only. Reads the table directly,
 * like tenant-store.ts: the registry is not itself tenant-scoped. Each call runs in
 * the request's transaction when one is open.
 */
class PlatformTenantsStore {
  private db: PostgresDB;
  private region: string;

  constructor({ db, region }: { db: PostgresDB; region: string }) {
    this.db = db;
    this.region = region;
  }

  private get conn(): PostgresDB {
    return connection(this.db);
  }

  /** Every tenant, inactive ones included, oldest first. */
  async list(): Promise<PlatformTenant[]> {
    const rows = await this.conn
      .select()
      .from(tenantTable)
      .orderBy(asc(tenantTable.createdAt), asc(tenantTable.tenantId));
    return rows.map(toTenant);
  }

  async get(tenantId: string): Promise<PlatformTenant | undefined> {
    const [row] = await this.conn
      .select()
      .from(tenantTable)
      .where(eq(tenantTable.tenantId, tenantId))
      .limit(1);
    return row ? toTenant(row) : undefined;
  }

  /** `tenantCode` must already be upper-case and trimmed: codes are stored that way. */
  async findByCode(tenantCode: string): Promise<PlatformTenant | undefined> {
    const [row] = await this.conn
      .select()
      .from(tenantTable)
      .where(eq(tenantTable.tenantCode, tenantCode))
      .limit(1);
    return row ? toTenant(row) : undefined;
  }

  /** TNT-G15: case-insensitive and trimmed, the same expression as the `tenant_name_key` index. */
  async findByName(tenantName: string): Promise<PlatformTenant | undefined> {
    const [row] = await this.conn
      .select()
      .from(tenantTable)
      .where(sql`lower(btrim(${tenantTable.tenantName})) = lower(btrim(${tenantName}))`)
      .limit(1);
    return row ? toTenant(row) : undefined;
  }

  async insert(input: CreatePlatformTenant): Promise<PlatformTenant> {
    const [row] = await this.conn.insert(tenantTable).values(input).returning();
    return toTenant(row);
  }

  /**
   * F-05 §9.4: a new tenant starts with the seed measurement groups, valid from
   * the tenant's own first day. Groups are per tenant, so each gets fresh ids.
   */
  async seedMeasurementGroups(tenantId: string, validFrom: string): Promise<void> {
    await this.conn.insert(measurementGroupTable).values(
      MEASUREMENT_GROUPS.map((g) => ({
        id: ulid(),
        region: this.region,
        tenantId,
        code: g.code,
        name: g.name,
        validFrom,
      })),
    );
  }

  /**
   * F-05 §9.4 (PO, 2026-10-26): a new tenant also starts with the 47 seed units,
   * each under its seed group. A code the tenant already has (case and spaces
   * ignored, active rows only) is skipped, so the seed never makes a second row.
   */
  async seedUnits(tenantId: string): Promise<void> {
    const groups = await this.conn
      .select({ id: measurementGroupTable.id, code: measurementGroupTable.code })
      .from(measurementGroupTable)
      .where(eq(measurementGroupTable.tenantId, tenantId));
    const groupId = new Map(groups.map((g) => [g.code, g.id]));
    const existing = await this.conn
      .select({ code: unitOfMeasurementTable.code })
      .from(unitOfMeasurementTable)
      .where(
        and(
          eq(unitOfMeasurementTable.tenantId, tenantId),
          isNull(unitOfMeasurementTable.deletedAt),
        ),
      );
    const taken = new Set(existing.map((u) => codeKey(u.code)));
    const rows = SEED_UNITS.filter((u) => groupId.has(u.groupCode) && !taken.has(codeKey(u.code)));
    if (rows.length === 0) return;
    await this.conn.insert(unitOfMeasurementTable).values(
      rows.map((u) => ({
        id: ulid(),
        region: this.region,
        tenantId,
        code: u.code,
        name: u.name,
        unit: u.unit,
        measurementGroupId: groupId.get(u.groupCode)!,
      })),
    );
  }

  async update(
    tenantId: string,
    patch: Partial<Pick<PlatformTenant, "tenantName" | "validTo">>,
  ): Promise<PlatformTenant> {
    const [row] = await this.conn
      .update(tenantTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tenantTable.tenantId, tenantId))
      .returning();
    return toTenant(row);
  }
}

export { PlatformTenantsStore };
