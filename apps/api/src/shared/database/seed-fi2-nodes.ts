// Tag declarations from the ECU gateway sheet. Each column is one asset.
// Every gateway is an OPC UA source with generated addresses, so the sheet's
// `ns=2;s=...` node ids are not stored. The address is derived as
// site/area/line/work unit/asset tag/tag name.
// Gateway columns follow the same machine clusters as the PLC addresses.
// The first weigher title was cut off in the paste; .7 is Weigher 1 because
// Weigher 2 is the next gateway, on .8.

import type { CountBasis, TagKind, TagRole } from "../../module/mes/asset-tags/asset-tags.js";
export type OpcType = "Boolean" | "UInt16" | "UInt32" | "Double";
export type TagSpec = [name: string, opcType: OpcType];

export type Gateway = {
  id: string;
  name: string;
  host: string;
  port: string;
  /** Asset tag after spaces are removed, compared case-insensitively. */
  machines: { key: string; nodePrefix: string }[];
};

const machine = (key: string, nodePrefix = key) => ({ key, nodePrefix });

export const GATEWAYS: Gateway[] = [
  {
    id: "ds-gw-machine-1",
    name: "ECU Gateway Machine 1",
    host: "10.234.227.2",
    port: "51210",
    machines: ["MITSUM-1", "MITSUM-2", "MITSUM-3"].map((key) => machine(key)),
  },
  {
    id: "ds-gw-mesin-2",
    name: "ECU Gateway Mesin 2",
    host: "10.234.25.21",
    port: "51210",
    machines: ["MITSUM-4", "MITSUM-6", "OMRONC-1", "OMRONC-3"].map((key) => machine(key)),
  },
  {
    id: "ds-gw-mesin-3",
    name: "ECU Gateway Mesin 3",
    host: "10.234.25.22",
    port: "51210",
    machines: ["MITSUM-5", "OMRONC-2", "MITSUF-2"].map((key) => machine(key)),
  },
  {
    id: "ds-gw-mesin-4",
    name: "ECU Gateway Mesin 4",
    host: "10.234.25.23",
    port: "51210",
    machines: ["OMRONM-1", "OMRONM-2", "OMRONM-3", "OMRONG-1"].map((key) => machine(key)),
  },
  {
    id: "ds-gw-mesin-5",
    name: "ECU Gateway Mesin 5",
    host: "10.234.227.6",
    port: "51210",
    machines: ["MITSUF-1", "MITSUF-3", "OMRONM-4"].map((key) => machine(key)),
  },
  {
    id: "ds-gw-weigher-1",
    name: "ECU Gateway Weigher 1",
    host: "10.234.227.7",
    port: "51210",
    // The ANRITSU62-1/-2/-3 bag checkweighers (lines 1-3) are not columns in
    // the gateway sheet, but the line sheet puts them on this gateway's IP (#26).
    machines: [
      "ANRITSU54-1",
      "ANRITSU62-1",
      "ANRITSU62-2",
      "ANRITSU62-3",
      "YAMATO-1",
      "YAMATO-2",
    ].map((key) => machine(key)),
  },
  {
    id: "ds-gw-weigher-2",
    name: "ECU Gateway Weigher 2",
    host: "10.234.227.8",
    port: "51210",
    machines: ["ANRITSU64-6", "YAMATO-11", "YAMATO-12", "ANRITSU57-5", "YAMATO-5"].map((key) =>
      machine(key),
    ),
  },
  {
    id: "ds-gw-weigher-3",
    name: "ECU Gateway Weigher 3",
    host: "10.234.227.9",
    port: "51210",
    machines: ["ANRITSU64-4", "ANRITSU64-2", "ANRITSU64-5", "ANRITSU62-7"].map((key) =>
      machine(key),
    ),
  },
  {
    id: "ds-gw-weigher-4",
    name: "ECU Gateway Weigher 4",
    host: "10.234.227.10",
    port: "51210",
    machines: ["ANRITSU64-3", "ANRITSU64-1"].map((key) => machine(key)),
  },
  {
    id: "ds-gw-weigher-5",
    name: "ECU Gateway Weigher 5",
    host: "10.234.227.11",
    port: "51210",
    machines: ["ANRITSU57-1", "ANRITSU57-2", "ANRITSU57-3"].map((key) => machine(key)),
  },
  {
    id: "ds-gw-weigher-6",
    name: "ECU Gateway Weigher 6",
    host: "10.234.227.12",
    port: "51210",
    machines: ["ANRITSU57-7", "ANRITSU58-1", "ANRITSU57-4"].map((key) => machine(key)),
  },
  {
    id: "ds-gw-weigher-7",
    name: "ECU Gateway Weigher 7",
    host: "10.234.227.13",
    port: "51210",
    machines: ["ANRITSU57-6", "ANRITSU58-3", "ANRITSU57-8"].map((key) => machine(key)),
  },
  {
    id: "ds-gw-weigher-8",
    name: "ECU Gateway Weigher 8",
    host: "10.234.227.14",
    port: "51210",
    machines: [
      machine("YAMATO-7", "Yamato-7"),
      machine("YAMATO-8", "Yamato-8"),
      machine("YAMATO-10", "Yamato-10"),
      machine("YAMATO-3", "Yamato-3"),
    ],
  },
];

const MITSUM: TagSpec[] = [
  ["Product_Code", "UInt16"],
  ["Total_Good_Prod", "UInt32"],
  ["Total_NG_Prod", "UInt32"],
  ["Total_Count", "UInt32"],
  ["Emergency", "Boolean"],
  ["Safery_Cover", "Boolean"],
  ["Air_Preassure", "Boolean"],
  ["Film_Positon_Motor_Error", "Boolean"],
  ["Tentsion_Control_MTR_Inverter_OL", "Boolean"],
  ["Anomaly_Detection_Disabled", "Boolean"],
  ["V_Seal_Thermocouple_FR", "Boolean"],
  ["V_Seal_Heater_Break_FR", "Boolean"],
  ["V_Seal_Abnormal_Temp_FR", "Boolean"],
  ["V_Seal_Thermocouple_RR", "Boolean"],
  ["V_Seal_Heater_Break_RR", "Boolean"],
  ["V_Seal_Abnormal_Temp_RR", "Boolean"],
  ["H_Seal_Thermocouple_FR", "Boolean"],
  ["H_Seal_Heater_Break_FR", "Boolean"],
  ["H_Seal_Abnormal_Temp_FR", "Boolean"],
  ["H_Seal_Thermocouple_RR", "Boolean"],
  ["H_Seal_Heater_Break_RR", "Boolean"],
  ["H_Seal_Abnormal_Temp_RR", "Boolean"],
  ["A1_Filling_Servo_Error", "Boolean"],
  ["A2_V_Seal_Servo_Error", "Boolean"],
  ["A3_H_Seal_Servo_Error", "Boolean"],
  ["A4_Slitter_Servo_Error", "Boolean"],
  ["M5_Cutter_Servo_Error", "Boolean"],
  ["NG_Converyor_Error", "Boolean"],
  ["A1_Filling_Servo_OL", "UInt16"],
  ["A2_V_Seal_Servo_OL", "UInt16"],
  ["A3_H_Seal_Servo_OL", "UInt16"],
  ["A4_Slitter_Servo_OL", "UInt16"],
  ["M5_Cutter_Servo_OL", "UInt16"],
  ["A1_Filling_Cycle_Time_Over", "Boolean"],
  ["A3_V_Seal_Cycle_Time_Over", "Boolean"],
  ["M5_Cutter_Cycle_Time_Over", "Boolean"],
  ["M5_Cutter_Position_Error", "Boolean"],
  ["Dischager_Chute_Position_Error", "Boolean"],
  ["Dischager_Chute_Sensor_Error_OK", "Boolean"],
  ["Dischager_Chute_Sensor_Error_NG", "Boolean"],
  ["Printer_1_Error", "Boolean"],
  ["Printer_2_Error", "Boolean"],
  ["PLC_Error", "Boolean"],
  ["PLC_Battery_Low", "Boolean"],
  ["GOT_Battery_Low", "Boolean"],
  ["Camera_Error", "Boolean"],
  ["Camera_Light_Error", "Boolean"],
  ["PRT_Trigger_Sensor_Error", "Boolean"],
  ["Rotary_Encoder_Error", "Boolean"],
  ["Film_Joint_Sensor_Error", "Boolean"],
  ["Mark_Sensor_Error", "Boolean"],
  ["Mark_Detection_error", "Boolean"],
  ["Film_End", "Boolean"],
  ["Hopper_Empty", "Boolean"],
  ["Filme_Joint", "Boolean"],
  ["Empty_Sachet", "UInt16"],
  ["Film_Short", "Boolean"],
  ["Hopper_Low", "Boolean"],
  ["Machine_Run", "Boolean"],
  ["Machine_Stop", "Boolean"],
  ["Film_Yield", "Double"],
];

const OMRONC: TagSpec[] = [
  ["Product_Code", "UInt16"],
  ["Product_Count", "UInt16"],
  ["Reject_Count", "UInt16"],
  ["Status", "Boolean"],
];

const OMRONM: TagSpec[] = [
  ["Product_Code", "UInt16"],
  ["Product_Count", "UInt32"],
  ["Machine_Run", "Boolean"],
  ["Machine_Stop", "Boolean"],
];

const WEIGHER: TagSpec[] = [
  ["Status", "Double"],
  ["Product_Code", "Double"],
  ["Product_Count", "Double"],
  ["Good_Condition_Count", "Double"],
  ["NG_Condition_Count", "Double"],
  ["NG_Under_Count", "Double"],
  ["NG_Over_Count", "Double"],
  ["Total_Weight", "Double"],
  ["Total_Good_Weight", "Double"],
  ["Total_NG_Weight", "Double"],
];

const MITSUF_COUNTS: TagSpec[] = [
  ["Product_Code", "UInt16"],
  ["Product_Count", "UInt16"],
  ["Good_Condition_Count", "UInt16"],
  ["NG_Condition_Count", "UInt16"],
  ["NG_ST_Bag_Position", "UInt16"],
  ["NG_Barcode_Reading", "UInt16"],
  ["NG_Barcode_Verifying", "UInt16"],
  ["NG_Double_Picking", "UInt16"],
  ["NG_Print_Action", "UInt16"],
  ["NG_Print_Inspection", "UInt16"],
  ["NG_Bag_Opening_Vacuum", "UInt16"],
  ["NG_Bag_Opening", "UInt16"],
  ["NG_No_Product_Filled", "UInt16"],
  ["NG_ST_Bag_Opening_Vacuum", "UInt16"],
  ["NG_ST_Bag_Position_2", "UInt16"],
  ["NG_Seal_Process", "UInt16"],
  ["NG_Seal_Overload", "UInt16"],
  ["NG_Seal_Load_Decresing", "UInt16"],
  ["NG_Cooling_Process", "UInt16"],
  ["NG_Seal_Process_2", "UInt16"],
  ["NG_Seal_Overload_2", "UInt16"],
  ["NG_Seal_Load_Decresing_2", "UInt16"],
  ["NG_Burn", "UInt16"],
];

const MITSUF_FAULTS = [
  "Machine_Stop",
  "Machine_Run",
  "Emergency_Stop",
  "Inverter_Alarm",
  "Main_Encoder_Abnormal",
  "Thermal_Trip",
  "Servo_Controller_CPU_Abnormal",
  "Bag_Lateral_Transfer_Servo_Alarm_1_axis",
  "Bag_Feed_Servo_Alarm_2_axis_",
  "Bottom_Vibration_Servo_Alarm_3_axis_",
  "Top_Seal_Servo_Alarm_4_axis",
  "Seal_Cooling_Servo_Alarm_5_axis",
  "Servo_Alarm_6_axis",
  "Servo_Alarm_7_axis",
  "Servo_Alarm_Axis_8",
  "Servo_Alarm_Axis_9",
  "Servo_Alarm_Axis_10",
  "Servo_Alarm_Axis_11",
  "Servo_Alarm_Axis_12",
  "Bag_Separation_Motor_Alarm_Axis_13",
  "Filling_Hopper_Motor_Alarm_Axis_14",
  "Feed_Pipe_Width_Adjustment_Motor_Alarm_Axis_15",
  "4th_Process_Opening_Motor_Alarm_Axis_16",
  "7th_Process_Opening_Motor_Alarm_Axis_17",
  "Stepping_Motor_Alarm_18th_Axis",
  "Stepping_Motor_Alarm_19th_Axis",
  "Stepping_Motor_Alarm_20th_Axis",
  "Handwheel_in_Use",
  "Door_Open_During_Operation",
  "Spindle_Rotation_Absent_Abnormal",
  "Opening_Motor_Operation_Abnormal",
  "Jogo_Height_Abnormal",
  "Jogo_Jammed",
  "Bottom_Vibration_Operation_Abnormal",
  "Top_Seal_Operation_Abnormal",
  "Cooling_seal_operation_error",
  "Discharge_error",
  "Chuck_opening_jaw_operation_error",
  "Chuck_updown_stop_operation_error",
  "Hopper_rise_operation_error",
  "7th_Process_Opening_Motor_Operation_Abnormal",
  "Thermal_printer_cylinder_error",
  "Print_inspection_bag_clamp_error",
  "Small_bag_hopper_updown_motion_error",
  "Pneumatic_alarm",
  "Insertion_Abnormal",
  "Insertion_Speed_Upper_Limit_Alarm",
  "Clamping_UpDown_Cylinder_Abnormal",
  "Clamping_Cylinder_Abnormal",
  "Empty_Bag_Ejection_Cylinder_Abnormal",
  "Double_Pick_Detection_Cylinder_Abnormal",
  "Single_Pick_Cylinder_Abnormal",
  "Blow_off_Upper_End_Proximity_Abnormal",
  "Blow_off_Lower_End_Proximity_Abnormal",
  "Blow_off_UpDown_Motion_Abnormal",
  "Two_stage_bag_hold_cylinder_abnormality",
  "Continuous_operation_without_product_filling",
  "Top_seal_torque_limit_abnormality",
  "Seal_cooling_torque_limit_abnormality",
  "Top_seal_closing_position_error",
  "Cooling_seal_closing_position_error",
  "Temperature_controller_communication_error",
  "Inverter_Communication_Error",
  "Servo_Controller_Communication_Error",
  "Servo_Controller_Low_Battery",
  "PLC_Low_Battery",
  "Touch_Panel_Low_Battery",
  "Inner_Heater_Disconnected",
  "Outer_Heater_Disconnected",
  "Abnormal_Inner_Temperature_During_Operation",
  "Abnormal_Outer_Temperature_During_Operation",
  "Heater_Power_OFF",
  "Weighing_Timing_Alarm",
  "Downstream_linkage_motor_abnormality",
  "Jaw_width_adjustment_motor_abnormality",
  "Discharge_chute_adjustment_motor_abnormality",
  "Printing_heater_open_circuit",
  "Printing_temperature_abnormality_during_operation",
  "Printing_Tape_Break",
  "Continuous_Thermal_Printer_Malfunction",
  "Thermal_Printer_Abnormal",
  "IJ_printer_abnormality",
  "Print_inspection_processing_abnormality",
  "Print_inspection_device_abnormality",
  "Small_bag_inserter_alarm",
  "Small_bag_timing_alarm",
  "IJP_print_operation_NG_continuous",
  "Overfill_alarm",
  "Metal_detection_alarm",
  "Sorting_cylinder_error",
  "Sorting_defect_discharge_confirmation_error",
  "Sorting_Rejection_Confirmation_Sensor_Abnormal",
  "Top_Printing_Heater_Open_Circuit",
  "Top_Printing_Temperature_Abnormal_During_Operation",
  "Top_printing_tape_out",
  "Barcode_verification_failed",
  "Barcode_scanner_processing_error",
  "Barcode_scanner_error",
  "Supply_butterfly_valve_operation_error_A",
  "Supply_Butterfly_Valve_Operation_Abnormal_B",
  "Supply_Butterfly_Valve_Operation_Abnormal_C",
  "Supply_Butterfly_Valve_Operation_Abnormal_D",
  "Supply_Butterfly_Valve_Switching_Alarm",
  "Process_7_Claw_Retraction_Cylinder_Abnormal",
  "M21_Bag_Lateral_Transfer_Motor_Battery_Low",
  "M22_Bag_Supply_Motor_Battery_Low",
  "M23_Vibration_Motor_Low_Battery",
  "M24_Top_Seal_Motor_Low_Battery",
  "M25_Seal_Cooling_Motor_Low_Battery",
  "Bag_Magazine_Continuous_Operation_Without_Stopping",
  "Bag_magazine_limit_sensor_error",
  "Bag_magazine_updown_motor_error",
  "Bag_magazine_switch_cylinder_error",
  "Conveyor_bag_feeding_motor_error",
  "Continuous_Bag_Leading_Edge_Not_Arrived",
  "Front_Cylinder_Abnormal_Before_Bag_Positioning",
  "Rear_Cylinder_Abnormal_After_Bag_Positioning",
  "Bag_Height_Detection_Sensor_Abnormal",
  "Continuous_No_Bag_in_Feeding_Section",
  "Continuous_Bag_Feeding_Error",
  "Continuous_Opening_Error_Open",
  "Opening_Detection_Open_Side_Sensor_Error",
  "Opening_Detection_Closed_Side_Sensor_Error",
  "Bag_Height_NG_Continuous",
  "Bag_Height_Sensor_Abnormal",
  "Double_Pick_NG_Continuous",
  "Chuck_Opening_NG_Continuous",
  "Bottom_Opening_NG_Continuous",
  "Continuous_No_Bag_at_Printing_Section",
  "Continuous_Printing_Inspection_NG",
  "Continuous_Vacuum_NG_at_3rd_Process_Opening",
  "Continuous_Small_Bag_Insertion_NG",
  "Continuous_Single_Grab_NG",
  "Jammed_Continuous",
  "N2_Gas_Pressure_Drop_During_Operation",
  "Static_Eliminator_Malfunction",
  "Level_Reduction_Stop",
  "Filler_Alarm",
  "Opening_error_closed",
  "Bag_transfer_updown_motor_abnormality",
  "4th_process_opening_vacuum_NG_continuous",
  "2nd_process_bag_posture_NG_continuous",
  "Top_seal_operation_NG_continuous",
  "Top_seal_pressure_NG_continuous",
  "Cooling_seal_operation_NG_continuous",
  "Cooling_seal_pressure_NG_continuous",
  "Tablet_drop_detection_alarm",
  "Double_Pick_Sensor_Abnormal",
  "Jam_Sensor_Abnormal",
  "Small_Bag_Insertion_Confirmation_Sensor_Abnormal",
  "78_Process_Bag_Position_NG_Continuous",
  "2_Process_Bag_Position_Sensor_Abnormal",
  "78_Process_Bag_Position_Sensor_Abnormal",
  "Barcode_Reading_NG_Continuous",
  "7_Process_Opening_Vacuum_NG_Continuous",
] as const;

const MITSUF: TagSpec[] = [
  ...MITSUF_COUNTS,
  ...MITSUF_FAULTS.map((name) => [name, "Boolean"] as TagSpec),
];

export function assetKey(tag: string): string {
  return tag.replaceAll(/\s+/g, "").toUpperCase();
}

export type PlannedTag = {
  assetKey: string;
  sourceId: string;
  tagName: string;
  kind: TagKind;
  /** "" = a signal with no F-04 role (Film_Yield, ping): stored NULL (docs-molcadx#85). */
  tagRole: TagRole | "";
  countBasis: CountBasis | "";
};

const GOOD = new Set(["Total_Good_Prod", "Good_Condition_Count", "Good_Count"]);
const TOTAL = new Set(["Total_Count", "Product_Count"]);
const REJECT = new Set([
  "Total_NG_Prod",
  "NG_Condition_Count",
  "Reject_Count",
  "NG_Under_Count",
  "NG_Over_Count",
]);
const STATE = new Set(["Machine_Run", "Machine_Stop", "Status"]);
/**
 * The vertical packers' per-cause reject signals fire once per event with no
 * running number (F-04 §9.7, PO 2026-10-03, docs-molcadx#85 item 4): role
 * `reject_reason`, kind `occurrence`, each naming its cause. They never add to
 * the reject count — `Total_NG_Prod` (a `reject` cumulative counter) does.
 */
const OCCURRENCE = new Set(["Defective_Print", "Empty_Sachet"]);
/**
 * A checkweigher's running weight totals (F-04 §9.7, PO 2026-10-02, item 3):
 * role `measured_total`, never `total` / `good` / `reject`, so grams are never
 * added to piece counts. Its piece counters keep their count roles.
 */
const WEIGHT = new Set(["Total_Weight", "Total_Good_Weight", "Total_NG_Weight"]);
const QUANTITY_ROLES = new Set(["total", "good", "reject"]);

/** A total/good/reject counter that counts packs, not a checkweigher's mass. */
export function isPackCounter(tag: Pick<PlannedTag, "tagName" | "tagRole">): boolean {
  return QUANTITY_ROLES.has(tag.tagRole) && !WEIGHT.has(tag.tagName);
}

function familyOf(key: string): "mitsum" | "omronc" | "omronm" | "mitsuf" | "weigher" {
  if (key.startsWith("MITSUM-")) return "mitsum";
  if (key.startsWith("OMRONC-")) return "omronc";
  if (key.startsWith("OMRONM-") || key.startsWith("OMRONG-")) return "omronm";
  if (key.startsWith("MITSUF-")) return "mitsuf";
  return "weigher";
}

function specsFor(key: string): TagSpec[] {
  const family = familyOf(key);
  if (family === "mitsum") {
    const tags = MITSUM.filter((tag) => key !== "MITSUM-1" || tag[0] !== "Film_Joint_Sensor_Error");
    if (key === "MITSUM-1")
      return [...tags, ["Good_Count", "UInt16"], ["Defective_Print", "UInt16"]];
    return [...tags, ["Defective_Print", "UInt16"]];
  }
  if (family === "omronc") return OMRONC;
  if (family === "omronm") return OMRONM;
  if (family === "mitsuf") return MITSUF;
  if (key === "ANRITSU57-3") {
    return WEIGHER.map((tag) => (tag[0] === "Total_Good_Weight" ? ["ping", "Double"] : tag));
  }
  return WEIGHER;
}

function classify(
  name: string,
  opcType: OpcType,
): Pick<PlannedTag, "kind" | "tagRole" | "countBasis"> {
  if (name === "Product_Code") return { kind: "value", tagRole: "product_code", countBasis: "" };
  if (name === "Film_Yield" || name === "ping")
    return { kind: "value", tagRole: "", countBasis: "" };
  if (STATE.has(name)) {
    return {
      kind: opcType === "Boolean" ? "boolean" : "value",
      tagRole: "machine_state",
      countBasis: "",
    };
  }
  if (WEIGHT.has(name))
    return { kind: "cumulative_counter", tagRole: "measured_total", countBasis: "" };
  if (OCCURRENCE.has(name)) return { kind: "occurrence", tagRole: "reject_reason", countBasis: "" };
  if (
    GOOD.has(name) ||
    TOTAL.has(name) ||
    REJECT.has(name) ||
    (name.startsWith("NG_") && opcType !== "Boolean")
  ) {
    const tagRole = GOOD.has(name) ? "good" : TOTAL.has(name) ? "total" : "reject";
    return { kind: "cumulative_counter", tagRole, countBasis: "unit" };
  }
  if (opcType === "Boolean") return { kind: "boolean", tagRole: "downtime_reason", countBasis: "" };
  return { kind: "value", tagRole: "downtime_reason", countBasis: "" };
}

export function plannedTags(): PlannedTag[] {
  const tags: PlannedTag[] = [];
  for (const gateway of GATEWAYS) {
    for (const item of gateway.machines) {
      for (const [name, opcType] of specsFor(item.key)) {
        const role = classify(name, opcType);
        tags.push({
          assetKey: item.key,
          sourceId: gateway.id,
          tagName: name,
          kind: role.kind,
          tagRole: role.tagRole,
          countBasis: role.countBasis,
        });
      }
    }
  }
  return tags;
}

export function gatewayIdForAsset(tag: string): string {
  const key = assetKey(tag);
  for (const gateway of GATEWAYS) {
    if (gateway.machines.some((item) => item.key === key)) return gateway.id;
  }
  return "";
}
