import type { Settings, Unit } from "../types";
export const convert = (value: number, unit: Unit) =>
  value / (unit === "mmol/L" ? 18.0182 : 1);
export const number = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits }).format(
        value,
      );
export const glucoseLabel = (value: number | null | undefined, unit: Unit) =>
  value === null || value === undefined ? "—" : number(convert(value, unit), 1);
export const percent = (value: number, total: number) =>
  total > 0 ? (value / total) * 100 : NaN;
export const escapeHtml = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const bandLabels = (s: Settings) => [
  `< ${glucoseLabel(s.bands[0], s.unit)}`,
  `${glucoseLabel(s.bands[0], s.unit)} – < ${glucoseLabel(s.bands[1], s.unit)}`,
  `${glucoseLabel(s.bands[1], s.unit)} – ${glucoseLabel(s.bands[2], s.unit)}`,
  `> ${glucoseLabel(s.bands[2], s.unit)} – ${glucoseLabel(s.bands[3], s.unit)}`,
  `> ${glucoseLabel(s.bands[3], s.unit)}`,
];
