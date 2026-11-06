import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

// The physical QR label on an asset (sub-feature of the asset register, 6 Nov 2026): one live label per asset, its
// printed text, how often it was printed, and whether it hangs on the machine. The QR itself holds a link to the
// asset (`<app>/q/<assetId>`), so any phone camera opens it; this row is the label's lifecycle, not the link.
export const assetLabelTable = masterData.table(
  "asset_label",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    assetId: p.text("asset_id").notNull(),
    // printed / installed / damaged (needs a reprint) / retired (asset gone)
    status: p.text("status").notNull().default("printed"),
    printCount: p.integer("print_count").notNull().default(0),
    lastPrintedAt: p.timestamp("last_printed_at", { withTimezone: true, mode: "string" }),
    lastPrintedBy: p.text("last_printed_by").notNull().default(""),
    installedAt: p.timestamp("installed_at", { withTimezone: true, mode: "string" }),
    installedBy: p.text("installed_by").notNull().default(""),
    note: p.text("note").notNull().default(""),
    ...dating(),
  },
  scopeIdx("asset_label"),
);
