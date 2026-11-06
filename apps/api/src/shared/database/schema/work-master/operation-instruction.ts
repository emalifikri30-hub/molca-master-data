import * as p from "drizzle-orm/pg-core";

import { masterData, id, region, tenantId, stamps, datingDays, scopeIdx } from "../columns.js";

export const operationInstructionTable = masterData.table(
  "operation_instruction",
  {
    id: id(),
    region: region(),
    tenantId: tenantId(),
    ...stamps(),
    instructionId: p.text("instruction_id").notNull(),
    routingId: p.text("routing_id").notNull(),
    stepId: p.text("step_id").notNull(),
    sequence: p.integer("sequence").notNull(),
    instructionText: p.text("instruction_text").notNull(),
    requiresConfirmation: p.boolean("requires_confirmation").notNull(),
    ...datingDays(),
  },
  scopeIdx("operation_instruction"),
);
