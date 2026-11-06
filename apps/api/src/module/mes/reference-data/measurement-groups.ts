// FOUNDATION F-05 §9.4 seed rows for MEASUREMENT_GROUP (PO, 2026-10-26).
// A group is rows in a table, not a fixed set of codes: this list is only
// what a new tenant starts with. Time is not a group — durations convert
// through TIME_CONVERSIONS.

import type { MeasurementGroup } from "./reference-data.js";

export const MEASUREMENT_GROUPS: ReadonlyArray<MeasurementGroup> = [
  { id: "mg-count", code: "count", name: "Count" },
  { id: "mg-mass", code: "mass", name: "Mass" },
  { id: "mg-volume", code: "volume", name: "Volume" },
  { id: "mg-length", code: "length", name: "Length" },
  { id: "mg-area", code: "area", name: "Area" },
  { id: "mg-throughput", code: "throughput", name: "Throughput" },
  { id: "mg-mass-flow", code: "mass_flow", name: "Mass flow" },
  { id: "mg-volume-flow", code: "volume_flow", name: "Volume flow" },
  { id: "mg-linear-speed", code: "linear_speed", name: "Linear speed" },
  { id: "mg-rotational-speed", code: "rotational_speed", name: "Rotational speed" },
  { id: "mg-temperature", code: "temperature", name: "Temperature" },
  { id: "mg-pressure", code: "pressure", name: "Pressure" },
  { id: "mg-energy", code: "energy", name: "Energy" },
  { id: "mg-power", code: "power", name: "Power" },
  { id: "mg-electric-current", code: "electric_current", name: "Electric current" },
  { id: "mg-voltage", code: "voltage", name: "Voltage" },
  { id: "mg-ratio", code: "ratio", name: "Ratio" },
  { id: "mg-other", code: "other", name: "Other" },
];
