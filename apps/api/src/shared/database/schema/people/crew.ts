import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

// A crew (regu): people who work together on a site and shift under a leader. Maintenance schedules and assigns
// by crew; members are person ids (person.ts). Never deleted, only deactivated.
export const crewTable = masterData.table(
  "crew",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    siteId: p.text("site_id").notNull().default(""),
    shift: p.text("shift").notNull().default(""),
    leaderId: p.text("leader_id").notNull().default(""),
    memberIds: p.jsonb("member_ids").$type<string[]>().notNull().default([]),
    ...dating(),
  },
  scopeIdx("crew"),
);
