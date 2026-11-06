// FOUNDATION F-05 §9.4 seed units (PO, 2026-10-26): the 47 UNIT_OF_MEASUREMENTS
// rows a new tenant starts with, keyed by their MEASUREMENT_GROUP code. They are
// ordinary rows — the tenant admin can rename, deactivate or add to them.
// "other" gets none.

export type SeedUnit = { groupCode: string; code: string; name: string; unit: string };

const group = (groupCode: string, rows: ReadonlyArray<[string, string, string]>): SeedUnit[] =>
  rows.map(([code, name, unit]) => ({ groupCode, code, name, unit }));

export const SEED_UNITS: ReadonlyArray<SeedUnit> = [
  ...group("count", [
    ["PCS", "Piece", "pcs"],
    ["PACK", "Pack", "pack"],
    ["BOX", "Box", "box"],
    ["CASE", "Case", "case"],
    ["CTN", "Carton", "ctn"],
    ["ROLL", "Roll", "roll"],
    ["SHEET", "Sheet", "sheet"],
  ]),
  ...group("mass", [
    ["MG", "Milligram", "mg"],
    ["G", "Gram", "g"],
    ["KG", "Kilogram", "kg"],
    ["TON", "Tonne", "ton"],
  ]),
  ...group("volume", [
    ["ML", "Millilitre", "mL"],
    ["L", "Litre", "L"],
    ["M3", "Cubic metre", "m³"],
  ]),
  ...group("length", [
    ["MM", "Millimetre", "mm"],
    ["CM", "Centimetre", "cm"],
    ["M", "Metre", "m"],
  ]),
  ...group("area", [
    ["CM2", "Square centimetre", "cm²"],
    ["M2", "Square metre", "m²"],
  ]),
  ...group("throughput", [
    ["PCS_MIN", "Pieces per minute", "pcs/min"],
    ["PACK_MIN", "Packs per minute", "pack/min"],
    ["PCS_H", "Pieces per hour", "pcs/h"],
  ]),
  ...group("mass_flow", [
    ["KG_H", "Kilograms per hour", "kg/h"],
    ["TON_H", "Tonnes per hour", "ton/h"],
  ]),
  ...group("volume_flow", [
    ["L_MIN", "Litres per minute", "L/min"],
    ["M3_H", "Cubic metres per hour", "m³/h"],
  ]),
  ...group("linear_speed", [
    ["M_MIN", "Metres per minute", "m/min"],
    ["M_S", "Metres per second", "m/s"],
  ]),
  ...group("rotational_speed", [
    ["RPM", "Revolutions per minute", "rpm"],
    ["HZ", "Hertz", "Hz"],
  ]),
  ...group("temperature", [
    ["DEG_C", "Degree Celsius", "°C"],
    ["DEG_F", "Degree Fahrenheit", "°F"],
    ["K", "Kelvin", "K"],
  ]),
  ...group("pressure", [
    ["BAR", "Bar", "bar"],
    ["KPA", "Kilopascal", "kPa"],
    ["PSI", "Pound per square inch", "psi"],
  ]),
  ...group("energy", [
    ["WH", "Watt-hour", "Wh"],
    ["KWH", "Kilowatt-hour", "kWh"],
    ["MJ", "Megajoule", "MJ"],
  ]),
  ...group("power", [
    ["W", "Watt", "W"],
    ["KW", "Kilowatt", "kW"],
  ]),
  ...group("electric_current", [["A", "Ampere", "A"]]),
  ...group("voltage", [["V", "Volt", "V"]]),
  ...group("ratio", [
    ["PCT", "Percent", "%"],
    ["PPM", "Parts per million", "ppm"],
    ["PCT_RH", "Relative humidity", "%RH"],
    ["BRIX", "Degree Brix", "°Brix"],
  ]),
];
