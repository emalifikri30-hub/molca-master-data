import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, dating, scopeIdx } from "../columns.js";

// People who do the work (MolcaDx MAM, gap 10 of the MES master data): technicians and other staff with their
// craft, skills, shift and internal hourly rate. Maintenance books labour against them and costs it at the rate;
// the scheduler reads craft, skills and shift. `username` links the person to their sign-in when they have one.
export const personTable = masterData.table(
  "person",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    code: p.text("code").notNull(),
    name: p.text("name").notNull(),
    username: p.text("username").notNull().default(""),
    craft: p.text("craft").notNull().default(""),
    skills: p.jsonb("skills").$type<string[]>().notNull().default([]),
    siteId: p.text("site_id").notNull().default(""),
    shift: p.text("shift").notNull().default(""),
    hourlyRate: p.numeric("hourly_rate", { precision: 14, scale: 2 }),
    phone: p.text("phone").notNull().default(""),
    ...dating(),
  },
  scopeIdx("person"),
);
