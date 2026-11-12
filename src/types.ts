export type Unit = "mg/dL" | "mmol/L";
export type DateOrder = "DMY" | "MDY";
export interface Reading {
  timestamp: number;
  localDate: string;
  localTime: string;
  glucose: number;
  source: "historic" | "scan";
  sensorId: string;
}
export interface CgmEvent {
  id: string;
  timestamp: number;
  category: string;
  label: string;
  comment: string;
  durationMin?: number;
}
export interface ImportResult {
  readings: Reading[];
  scans: Reading[];
  invalid: number;
  duplicates: number;
  conflicts: number;
  sensorCount: number;
  source: "historic" | "scan";
  warnings: string[];
}
export interface EventImport {
  events: CgmEvent[];
  invalid: number;
  duplicates: number;
  warnings: string[];
}
export interface Settings {
  bands: [number, number, number, number];
  target: [number, number];
  unit: Unit;
}
export interface Session {
  data: ImportResult;
  events: CgmEvent[];
  importedAt: string;
  eventInvalid: number;
}
export const DEFAULTS: Settings = {
  bands: [70, 100, 140, 180],
  target: [70, 140],
  unit: "mg/dL",
};
export const COLORS = ["#8875ac", "#4f9877", "#5d91bf", "#c49a45", "#bd6665"];
