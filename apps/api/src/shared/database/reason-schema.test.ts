import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { auditedTable } from "../audit/audit-entities.js";
import { downtimeReasonTickTable, rejectReasonTickTable } from "./schema/schema.js";

describe("reason assignment schema", () => {
  it("uses separate physical tables for downtime and reject assignments", () => {
    expect(getTableName(downtimeReasonTickTable)).toBe("downtime_reason_asset");
    expect(getTableName(rejectReasonTickTable)).toBe("reject_reason_asset");
  });

  it("audits each physical table as its matching entity type", () => {
    expect(auditedTable("downtime_reason_asset")?.entityType).toBe("DOWNTIME_REASON_ASSET");
    expect(auditedTable("reject_reason_asset")?.entityType).toBe("REJECT_REASON_ASSET");
    expect(auditedTable("reason_asset")).toBeUndefined();
  });
});
