import * as z from "zod";

// Narrow on purpose: only the fields the readers use. `z.looseObject` keeps
// unknown keys out of the failure path, so an additive upstream change passes
// (`outputEvents` included) and a rename of a field we read fails as a `parse_error`.

function envelopeSchema<T extends z.ZodType>(data: T) {
  return z.looseObject({ data: z.nullable(data), error: z.nullable(z.string()) });
}

const workOrderSchema = z.looseObject({
  id: z.string(),
  woNumber: z.string(),
  productId: z.string(),
  siteId: z.string(),
  status: z.string(),
  routingId: z.nullish(z.string()),
});

// The plan: one OPERATION step on one work unit, on a Work Order.
const jobOrderSchema = z.looseObject({
  id: z.string(),
  workOrderId: z.string(),
  operationId: z.string(),
  workUnitId: z.nullable(z.string()),
  status: z.string(),
});

// The actuals: one run of a Job Order in one shift instance.
const executionSchema = z.looseObject({
  id: z.string(),
  jobOrderId: z.string(),
  workUnitId: z.nullable(z.string()),
  shiftInstanceId: z.nullable(z.string()),
  goodQty: z.number(),
  scrapQty: z.number(),
  reworkQty: z.nullable(z.number()),
  actualStart: z.nullable(z.string()),
  actualEnd: z.nullable(z.string()),
  status: z.string(),
});

// All three arrays are required; they may be empty.
const executionsEnvelopeSchema = envelopeSchema(
  z.looseObject({
    workOrders: z.array(workOrderSchema),
    jobOrders: z.array(jobOrderSchema),
    executions: z.array(executionSchema),
  }),
);

// Every effective-dated SHIFT_BREAK row (K-28): the calculation reads them all
// so a shift instance keeps the hours that were in force at its start.
const breaksSchema = z.array(
  z.looseObject({
    id: z.string(),
    siteId: z.string(),
    enterpriseShiftId: z.string(),
    workUnitId: z.nullable(z.string()),
    startTime: z.string(),
    endTime: z.string(),
    label: z.nullable(z.string()),
    effectiveFrom: z.string(),
    effectiveTo: z.nullable(z.string()),
  }),
);

const breaksEnvelopeSchema = envelopeSchema(breaksSchema);

export { breaksEnvelopeSchema, executionsEnvelopeSchema };
