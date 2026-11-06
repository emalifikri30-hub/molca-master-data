// FOUNDATION F-08 Work Master (PRD-003 08-work-master.md): PRODUCT_FLOW,
// BOM / BOM_LINE (WMS-002) and ROUTING / OPERATION with its station
// overrides, dependencies, instructions and checks (WMS-003).
//
// Versions (W-8, PO 2026-09-30): each BOM / ROUTING version is its own row
// with `version` + `status`; a work order pins one by its id. Structural
// edits happen on a draft only; standard edits are dated rows inside the
// version (F-08 "Versions and status").
//
// Step identity: `stepId` is F-08's `step_id` (PO 2026-10-02, prd-molcadx#26
// item 1) as other rows reference it (BOM_LINE.step_id — `operation_id` until
// then — OPERATION_WORK_UNIT, OPERATION_DEPENDENCY, instructions, checks). All
// dated OPERATION rows of one step share it, and a new routing version keeps
// it, so a BOM line's entry step survives a routing version (WMS-003 AC-33).

import type {
  BOM_LINE_USE_VALUES,
  CHECK_FREQUENCY_VALUES,
  CHECK_VALUE_TYPE_VALUES,
  TOLERANCE_TYPE_VALUES,
  VERSION_STATUS_VALUES,
} from "../../../shared/database/schema/value-lists.js";
type VersionStatus = (typeof VERSION_STATUS_VALUES)[number];

/** F-08 §9.0. Every product has one; "Standard" is made automatically. */
type ProductFlow = {
  id: string;
  productId: string;
  flowCode: string;
  flowName: string;
  isPrimary: boolean;
  status: VersionStatus;
  validFrom: string;
  validTo: string | null;
};

type LineUse = (typeof BOM_LINE_USE_VALUES)[number];
type ToleranceType = (typeof TOLERANCE_TYPE_VALUES)[number];

/** F-08 §9.4. Not effective-dated: any change is structural (new version). */
type BomLine = {
  id: string;
  componentProductId: string;
  /** The step (`stepId`) where the line enters or comes out. null = the first step. */
  stepId: string | null;
  lineUse: LineUse;
  /** Only on produced lines; null on consumed ones. */
  isPrimaryOutput: boolean | null;
  /** Net, per `Bom.baseQty` of the parent. */
  qtyPerUnit: number;
  uomId: string;
  scrapFactor: number;
  /** WMS-002 rule 10: ± percent or ± quantity in the line's unit. null = no dispensing check. */
  dispenseToleranceType: ToleranceType | null;
  dispenseToleranceValue: number | null;
};

/** F-08 §9.3. */
type Bom = {
  id: string;
  productId: string;
  flowId: string;
  version: number;
  status: VersionStatus;
  /** Recipe base quantity: the lines are written per this much of the parent. */
  baseQty: number;
  baseUomId: string;
  /** Only on a semi_finished product (WMS-002 rule 7). */
  isPhantom: boolean;
  validFrom: string;
  validTo: string | null;
  lines: Array<BomLine>;
};

/** F-08 §9.1. */
type Routing = {
  id: string;
  productId: string;
  workCenterId: string;
  flowId: string;
  /** 1, 2, 3… per flow + work center. */
  version: number;
  status: VersionStatus;
  isPrimary: boolean;
  /** Declared here only; blocking out-of-order steps is PRODUCTION's rule (WMS-003 rule 16). */
  enforceSequence: boolean;
  validFrom: string;
  validTo: string | null;
};

/** One dated row of one routing step (F-08 §9.2). All rows of a step share `stepId`. */
type Operation = {
  id: string;
  stepId: string;
  routingId: string;
  stepNumber: number;
  stepName: string;
  /** Free text, no system logic reads it. */
  stepType: string | null;
  /** One work unit or a machine class, never both (WMS-003 rule 4). */
  workUnitId: string | null;
  requiredWorkUnitClassId: string | null;
  /**
   * Discrete / batch: time for `batchSize` items of `uomId`, in
   * `timeConversionId`'s unit — "20 seconds / pack". Up to 6 decimals.
   * For a class step it is the class default.
   */
  cycleTimeValue: number | null;
  /** The ITEM unit the standard is per (pack, carton, kg) — never a time unit (F-08 §9.2.1). */
  uomId: string;
  /** The only time unit of the cycle time. */
  timeConversionId: string;
  batchSize: number | null;
  /** Continuous work centers: standard speed instead of cycle time. */
  standardSpeedValue: number | null;
  speedUomId: string | null;
  standardSetupTime: number | null;
  /** W-7: the setup time's unit, required when a setup time is set. */
  setupTimeConversionId: string | null;
  crewSize: number | null;
  /** Fraction, 0 ≤ x < 1 (5% → 0.05). null = 0. */
  plannedShrinkage: number | null;
  /** Percent of the theoretical output; either may be set alone (rule 19). */
  yieldMinPct: number | null;
  yieldMaxPct: number | null;
  /** Rule 20: above 0, with its time unit. */
  maxHoldTime: number | null;
  holdTimeConversionId: string | null;
  validFrom: string;
  validTo: string | null;
};

/** F-08 §9.2.2: a station that may run a class step, with an optional cycle-time override. */
type OperationWorkUnit = {
  id: string;
  routingId: string;
  stepId: string;
  workUnitId: string;
  /** null = the step's class default. Same time and item unit as the step. */
  cycleTimeValue: number | null;
  validFrom: string;
  validTo: string | null;
};

/** F-08 §9.2.3: `stepId` waits for `predecessorStepId`, inside one routing version. */
type OperationDependency = {
  id: string;
  routingId: string;
  stepId: string;
  predecessorStepId: string;
};

/** F-08 §9.2.5. Dated rows of one instruction share `instructionId`. */
type OperationInstruction = {
  id: string;
  instructionId: string;
  routingId: string;
  stepId: string;
  sequence: number;
  instructionText: string;
  requiresConfirmation: boolean;
  validFrom: string;
  validTo: string | null;
};

type CheckValueType = (typeof CHECK_VALUE_TYPE_VALUES)[number];
type CheckFrequency = (typeof CHECK_FREQUENCY_VALUES)[number];

/** F-08 §9.2.6. Dated rows of one check share `checkId`. */
type OperationCheck = {
  id: string;
  checkId: string;
  routingId: string;
  stepId: string;
  sequence: number;
  checkName: string;
  valueType: CheckValueType;
  targetValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  uomId: string | null;
  sampleCount: number;
  frequencyType: CheckFrequency;
  frequencyIntervalValue: number | null;
  frequencyIntervalConversionId: string | null;
  isCritical: boolean;
  validFrom: string;
  validTo: string | null;
};

type WorkMasterRefusal =
  | { kind: "qty_not_positive" }
  | { kind: "scrap_negative" }
  | { kind: "circular"; chain: Array<string> }
  | { kind: "overlap"; validFrom: string; validTo: string | null }
  | { kind: "cycle_not_positive" }
  | { kind: "gap"; from: string; to: string }
  | { kind: "too_early" }
  | { kind: "step_taken"; stepNumber: number }
  /** WMS-003 rule 10: no conversion path between the item unit and the product's base unit. */
  | {
      kind: "no_conversion";
      uomId: string;
      baseUomId: string;
      productCode: string;
      validFrom: string;
    }
  /** WMS-002 rule 6: the recipe base quantity must be above 0. */
  | { kind: "base_qty_not_positive" }
  /** WMS-002 rule 7: `wms-002.error.phantom-not-semi`. */
  | { kind: "phantom_not_semi" }
  /** WMS-002 rule 8. */
  | { kind: "entry_step_unknown" }
  | { kind: "produced_not_semi" }
  | { kind: "primary_output_count"; stepId: string }
  /** WMS-002 rule 10: `wms-002.error.tolerance-*`. */
  | { kind: "tolerance_value" }
  | { kind: "tolerance_percent" }
  | { kind: "tolerance_absolute" }
  | { kind: "tolerance_not_allowed" }
  /** A structural edit on a version that is not a draft (rule 1 / rule 5). */
  | { kind: "not_draft"; status: VersionStatus }
  /** WMS-003 rule 4: one work unit or one class, never both; stations of that class. */
  | { kind: "station_or_class" }
  | { kind: "station_not_in_class"; workUnitId: string }
  /** WMS-003 rule 12. */
  | { kind: "step_name_required" }
  | { kind: "setup_unit_required" }
  /** WMS-003 rule 13: `wms-003.error.shrinkage-range`. */
  | { kind: "shrinkage_range" }
  /** WMS-003 rule 14: `wms-003.error.loop`. */
  | { kind: "loop"; steps: Array<string> }
  /** WMS-003 rule 21: `wms-003.error.end-steps`. */
  | { kind: "end_steps"; steps: Array<string> }
  | { kind: "waits_for_unknown" }
  /** WMS-003 rule 17: `wms-003.instr.error.empty`. */
  | { kind: "instruction_empty" }
  /** WMS-003 rule 18: `wms-003.checks.error.*`. */
  | { kind: "check_no_limit"; checkName: string }
  | { kind: "check_range"; checkName: string }
  | { kind: "check_unit"; checkName: string }
  | { kind: "check_interval"; checkName: string }
  | { kind: "check_critical_note"; checkName: string }
  | { kind: "check_duplicate"; checkName: string }
  | { kind: "check_name_required" }
  /** WMS-003 rules 19–20: `wms-003.yield.error.range`, `wms-003.hold.error`. */
  | { kind: "yield_range" }
  | { kind: "hold_time" }
  /** A draft of this flow (and work center) already exists: edit that one. */
  /** WMS-002 AC-20 / WMS-003 AC-32: `version` names the open draft in the screen text. */
  | { kind: "draft_exists"; draftId: string; version: number; entity: "bom" | "routing" }
  /**
   * W-22 (PO 2026-10-03) / WMS-003 AC-36: the routing version drops a step a
   * released BOM line of the same flow enters at — `wms-003.error.step-used-by-bom`.
   */
  | {
      kind: "step_used_by_bom";
      version: number;
      bomVersion: number;
      component: string;
      step: string;
    };

export type {
  VersionStatus,
  ProductFlow,
  LineUse,
  ToleranceType,
  BomLine,
  Bom,
  Routing,
  Operation,
  OperationWorkUnit,
  OperationDependency,
  OperationInstruction,
  CheckValueType,
  CheckFrequency,
  OperationCheck,
  WorkMasterRefusal,
};
