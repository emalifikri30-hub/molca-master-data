import { eq } from "drizzle-orm";

import { openRepo, type DbDeps } from "../../../shared/database/open-repo.js";
import {
  bomLineTable,
  bomTable,
  operationCheckTable,
  operationDependencyTable,
  operationInstructionTable,
  operationTable,
  operationWorkUnitTable,
  productFlowTable,
  routingTable,
} from "../../../shared/database/schema/schema.js";

import type { EntityRepository } from "../../../shared/database/entity-repository.js";
import type {
  Bom,
  BomLine,
  Operation,
  OperationCheck,
  OperationDependency,
  OperationInstruction,
  OperationWorkUnit,
  ProductFlow,
  Routing,
} from "./work-master.js";

type BomHeader = Omit<Bom, "lines">;
type BomLineRow = BomLine & { bomId: string };

const FLOW_KEYS = [
  "id",
  "productId",
  "flowCode",
  "flowName",
  "isPrimary",
  "status",
  "validFrom",
  "validTo",
];
const BOM_KEYS = [
  "id",
  "productId",
  "flowId",
  "version",
  "status",
  "baseQty",
  "baseUomId",
  "isPhantom",
  "validFrom",
  "validTo",
];
const LINE_KEYS = [
  "id",
  "bomId",
  "componentProductId",
  "stepId",
  "lineUse",
  "isPrimaryOutput",
  "qtyPerUnit",
  "uomId",
  "scrapFactor",
  "dispenseToleranceType",
  "dispenseToleranceValue",
];
const ROUTING_KEYS = [
  "id",
  "productId",
  "workCenterId",
  "flowId",
  "version",
  "status",
  "isPrimary",
  "enforceSequence",
  "validFrom",
  "validTo",
];
const OPERATION_KEYS = [
  "id",
  "stepId",
  "routingId",
  "stepNumber",
  "stepName",
  "stepType",
  "workUnitId",
  "requiredWorkUnitClassId",
  "cycleTimeValue",
  "uomId",
  "timeConversionId",
  "batchSize",
  "standardSpeedValue",
  "speedUomId",
  "standardSetupTime",
  "setupTimeConversionId",
  "crewSize",
  "plannedShrinkage",
  "yieldMinPct",
  "yieldMaxPct",
  "maxHoldTime",
  "holdTimeConversionId",
  "validFrom",
  "validTo",
];
const STATION_KEYS = [
  "id",
  "routingId",
  "stepId",
  "workUnitId",
  "cycleTimeValue",
  "validFrom",
  "validTo",
];
const DEPENDENCY_KEYS = ["id", "routingId", "stepId", "predecessorStepId"];
const INSTRUCTION_KEYS = [
  "id",
  "instructionId",
  "routingId",
  "stepId",
  "sequence",
  "instructionText",
  "requiresConfirmation",
  "validFrom",
  "validTo",
];
const CHECK_KEYS = [
  "id",
  "checkId",
  "routingId",
  "stepId",
  "sequence",
  "checkName",
  "valueType",
  "targetValue",
  "minValue",
  "maxValue",
  "uomId",
  "sampleCount",
  "frequencyType",
  "frequencyIntervalValue",
  "frequencyIntervalConversionId",
  "isCritical",
  "validFrom",
  "validTo",
];

// Seed: the bread BOM chain and one routing on Packaging Line 1 (wc-1), each
// released version 1 of its product's automatic "Standard" flow (F-08 §9.0).
// The routing mirrors the PRD-003 WMS-003 example: step 10 (filler) is
// 20 s / pack, step 20 (cartoner) 216 s / carton; FG-BREAD-500's base unit is
// pack and 1 carton = 12 pack (products seed). uom-5 = pack, uom-6 = carton,
// tc-1 = seconds, tc-2 = minutes (the setup times were minutes before
// `setupTimeConversionId` existed).
const line = (
  l: Pick<BomLine, "id" | "componentProductId" | "qtyPerUnit" | "uomId" | "scrapFactor">,
): BomLine => ({
  stepId: null,
  lineUse: "consumed",
  isPrimaryOutput: null,
  dispenseToleranceType: null,
  dispenseToleranceValue: null,
  ...l,
});

const flow = (id: string, productId: string): ProductFlow => ({
  id,
  productId,
  flowCode: "STANDARD",
  flowName: "Standard",
  isPrimary: true,
  status: "released",
  validFrom: "2026-01-01",
  validTo: null,
});

class WorkMasterStore {
  private flowsRepo?: EntityRepository<ProductFlow>;
  private bomsRepo?: EntityRepository<BomHeader>;
  private linesRepo?: EntityRepository<BomLineRow>;
  private routingsRepo?: EntityRepository<Routing>;
  private operationsRepo?: EntityRepository<Operation>;
  private stationsRepo?: EntityRepository<OperationWorkUnit>;
  private dependenciesRepo?: EntityRepository<OperationDependency>;
  private instructionsRepo?: EntityRepository<OperationInstruction>;
  private checksRepo?: EntityRepository<OperationCheck>;

  flows: ProductFlow[] = [flow("pf-1", "prod-3"), flow("pf-2", "prod-2")];

  boms: Bom[] = [
    {
      id: "bom-1",
      productId: "prod-3",
      flowId: "pf-1",
      version: 1,
      status: "released",
      baseQty: 1,
      baseUomId: "uom-5",
      isPhantom: false,
      validFrom: "2026-01-01",
      validTo: null,
      lines: [
        line({
          id: "bl-1",
          componentProductId: "prod-2",
          qtyPerUnit: 0.55,
          uomId: "uom-2",
          scrapFactor: 0.02,
        }),
      ],
    },
    {
      id: "bom-2",
      productId: "prod-2",
      flowId: "pf-2",
      version: 1,
      status: "released",
      baseQty: 1,
      baseUomId: "uom-2",
      isPhantom: false,
      validFrom: "2026-01-01",
      validTo: null,
      lines: [
        line({
          id: "bl-2",
          componentProductId: "prod-1",
          qtyPerUnit: 0.6,
          uomId: "uom-2",
          scrapFactor: 0.01,
        }),
      ],
    },
  ];

  routings: Routing[] = [
    {
      id: "rt-1",
      productId: "prod-3",
      workCenterId: "wc-1",
      flowId: "pf-1",
      version: 1,
      status: "released",
      isPrimary: true,
      enforceSequence: false,
      validFrom: "2026-01-01",
      validTo: null,
    },
  ];

  operations: Operation[] = [
    {
      id: "op-1",
      stepId: "step-1",
      routingId: "rt-1",
      stepNumber: 10,
      stepName: "Filler Cell",
      stepType: null,
      workUnitId: "wu-1",
      requiredWorkUnitClassId: null,
      cycleTimeValue: 20,
      uomId: "uom-5",
      timeConversionId: "tc-1",
      batchSize: null,
      standardSpeedValue: null,
      speedUomId: null,
      standardSetupTime: 15,
      setupTimeConversionId: "tc-2",
      crewSize: 2,
      plannedShrinkage: null,
      yieldMinPct: null,
      yieldMaxPct: null,
      maxHoldTime: null,
      holdTimeConversionId: null,
      validFrom: "2026-01-01",
      validTo: null,
    },
    {
      id: "op-2",
      stepId: "step-2",
      routingId: "rt-1",
      stepNumber: 20,
      stepName: "Capping Cell",
      stepType: null,
      workUnitId: "wu-2",
      requiredWorkUnitClassId: null,
      cycleTimeValue: 216,
      uomId: "uom-6",
      timeConversionId: "tc-1",
      batchSize: null,
      standardSpeedValue: null,
      speedUomId: null,
      standardSetupTime: 10,
      setupTimeConversionId: "tc-2",
      crewSize: 1,
      plannedShrinkage: null,
      yieldMinPct: null,
      yieldMaxPct: null,
      maxHoldTime: null,
      holdTimeConversionId: null,
      validFrom: "2026-01-01",
      validTo: null,
    },
  ];

  operationWorkUnits: OperationWorkUnit[] = [];
  dependencies: OperationDependency[] = [];
  // WMS-003 step detail (F-08 §9.2.5–9.2.6, example data): one instruction
  // and one in-process check on the filler step. No class step is seeded:
  // the work unit class list is still empty (S-5), so no station has a class.
  instructions: OperationInstruction[] = [
    {
      id: "oi-1",
      instructionId: "instr-1",
      routingId: "rt-1",
      stepId: "step-1",
      sequence: 1,
      instructionText: "Check the film roll and the date coder before starting",
      requiresConfirmation: true,
      validFrom: "2026-01-01",
      validTo: null,
    },
  ];
  checks: OperationCheck[] = [
    {
      id: "oc-1",
      checkId: "check-1",
      routingId: "rt-1",
      stepId: "step-1",
      sequence: 1,
      checkName: "Pack weight",
      valueType: "numeric",
      targetValue: 500,
      minValue: 480,
      maxValue: 520,
      uomId: "uom-3",
      sampleCount: 5,
      frequencyType: "interval",
      frequencyIntervalValue: 30,
      frequencyIntervalConversionId: "tc-2",
      isCritical: true,
      validFrom: "2026-01-01",
      validTo: null,
    },
  ];

  constructor(deps?: DbDeps) {
    this.flowsRepo = openRepo<ProductFlow>(deps, productFlowTable, FLOW_KEYS);
    this.bomsRepo = openRepo<BomHeader>(deps, bomTable, BOM_KEYS);
    this.linesRepo = openRepo<BomLineRow>(deps, bomLineTable, LINE_KEYS);
    this.routingsRepo = openRepo<Routing>(deps, routingTable, ROUTING_KEYS);
    this.operationsRepo = openRepo<Operation>(deps, operationTable, OPERATION_KEYS);
    this.stationsRepo = openRepo<OperationWorkUnit>(deps, operationWorkUnitTable, STATION_KEYS);
    this.dependenciesRepo = openRepo<OperationDependency>(
      deps,
      operationDependencyTable,
      DEPENDENCY_KEYS,
    );
    this.instructionsRepo = openRepo<OperationInstruction>(
      deps,
      operationInstructionTable,
      INSTRUCTION_KEYS,
    );
    this.checksRepo = openRepo<OperationCheck>(deps, operationCheckTable, CHECK_KEYS);
  }

  async readFlows(): Promise<ProductFlow[]> {
    if (this.flowsRepo) return this.flowsRepo.list();
    return this.flows;
  }

  saveFlow(row: ProductFlow): Promise<ProductFlow> {
    return this.save(this.flowsRepo, this.flows, row);
  }

  async readBoms(): Promise<Bom[]> {
    if (!this.bomsRepo || !this.linesRepo) return this.boms;
    const [headers, lines] = await Promise.all([this.bomsRepo.list(), this.linesRepo.list()]);
    return headers.map((header) => ({
      ...header,
      lines: lines
        .filter((lineRow) => lineRow.bomId === header.id)
        .map(({ bomId: _bomId, ...rest }) => rest),
    }));
  }

  async saveBom(row: Bom): Promise<Bom> {
    if (this.bomsRepo && this.linesRepo) {
      const { lines, ...header } = row;
      const existing = await this.bomsRepo.get(row.id);
      if (existing) await this.bomsRepo.update(row.id, header);
      else await this.bomsRepo.insert(header);
      const current = await this.linesRepo.list(eq(bomLineTable.bomId, row.id));
      for (const old of current) await this.linesRepo.delete(old.id);
      for (const bomLine of lines) await this.linesRepo.insert({ ...bomLine, bomId: row.id });
      return row;
    }
    return this.save(undefined, this.boms, row);
  }

  async readRoutings(): Promise<Routing[]> {
    if (this.routingsRepo) return this.routingsRepo.list();
    return this.routings;
  }

  saveRouting(row: Routing): Promise<Routing> {
    return this.save(this.routingsRepo, this.routings, row);
  }

  async readOperations(): Promise<Operation[]> {
    if (this.operationsRepo) return this.operationsRepo.list();
    return this.operations;
  }

  saveOperation(row: Operation): Promise<Operation> {
    return this.save(this.operationsRepo, this.operations, row);
  }

  deleteOperation(id: string): Promise<void> {
    return this.remove(this.operationsRepo, this.operations, id);
  }

  async readStations(): Promise<OperationWorkUnit[]> {
    if (this.stationsRepo) return this.stationsRepo.list();
    return this.operationWorkUnits;
  }

  saveStation(row: OperationWorkUnit): Promise<OperationWorkUnit> {
    return this.save(this.stationsRepo, this.operationWorkUnits, row);
  }

  deleteStation(id: string): Promise<void> {
    return this.remove(this.stationsRepo, this.operationWorkUnits, id);
  }

  async readDependencies(): Promise<OperationDependency[]> {
    if (this.dependenciesRepo) return this.dependenciesRepo.list();
    return this.dependencies;
  }

  saveDependency(row: OperationDependency): Promise<OperationDependency> {
    return this.save(this.dependenciesRepo, this.dependencies, row);
  }

  deleteDependency(id: string): Promise<void> {
    return this.remove(this.dependenciesRepo, this.dependencies, id);
  }

  async readInstructions(): Promise<OperationInstruction[]> {
    if (this.instructionsRepo) return this.instructionsRepo.list();
    return this.instructions;
  }

  saveInstruction(row: OperationInstruction): Promise<OperationInstruction> {
    return this.save(this.instructionsRepo, this.instructions, row);
  }

  deleteInstruction(id: string): Promise<void> {
    return this.remove(this.instructionsRepo, this.instructions, id);
  }

  async readChecks(): Promise<OperationCheck[]> {
    if (this.checksRepo) return this.checksRepo.list();
    return this.checks;
  }

  saveCheck(row: OperationCheck): Promise<OperationCheck> {
    return this.save(this.checksRepo, this.checks, row);
  }

  deleteCheck(id: string): Promise<void> {
    return this.remove(this.checksRepo, this.checks, id);
  }

  async snapshot(): Promise<{
    flows: ProductFlow[];
    boms: Bom[];
    routings: Routing[];
    operations: Operation[];
    operationWorkUnits: OperationWorkUnit[];
    dependencies: OperationDependency[];
    instructions: OperationInstruction[];
    checks: OperationCheck[];
  }> {
    const [
      flows,
      boms,
      routings,
      operations,
      operationWorkUnits,
      dependencies,
      instructions,
      checks,
    ] = await Promise.all([
      this.readFlows(),
      this.readBoms(),
      this.readRoutings(),
      this.readOperations(),
      this.readStations(),
      this.readDependencies(),
      this.readInstructions(),
      this.readChecks(),
    ]);
    return {
      flows,
      boms,
      routings,
      operations,
      operationWorkUnits,
      dependencies,
      instructions,
      checks,
    };
  }

  private async save<T extends { id: string }>(
    repo: EntityRepository<T> | undefined,
    memory: T[],
    row: T,
  ): Promise<T> {
    if (repo) {
      const existing = await repo.get(row.id);
      if (existing) return (await repo.update(row.id, row)) ?? row;
      return repo.insert(row);
    }
    const index = memory.findIndex((item) => item.id === row.id);
    if (index === -1) memory.push(row);
    else if (memory[index] !== row) Object.assign(memory[index], row);
    return row;
  }

  private async remove<T extends { id: string }>(
    repo: EntityRepository<T> | undefined,
    memory: T[],
    id: string,
  ): Promise<void> {
    if (repo) {
      await repo.delete(id);
      return;
    }
    const index = memory.findIndex((item) => item.id === id);
    if (index !== -1) memory.splice(index, 1);
  }
}

export { WorkMasterStore };
