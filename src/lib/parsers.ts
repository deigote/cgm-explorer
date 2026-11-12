import Papa from "papaparse";
import type {
  CgmEvent,
  DateOrder,
  EventImport,
  ImportResult,
  Reading,
} from "../types";
import { dateKey, parseTimestamp, timeLabel } from "./time";
const norm = (s: string) =>
  s
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
function csvRows(text: string, headerTest: (cells: string[]) => boolean) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++)
    for (const delimiter of [",", ";", "\t"]) {
      const cells = Papa.parse<string[]>(lines[i], { delimiter }).data[0] || [];
      if (headerTest(cells.map(norm))) {
        const parsed = Papa.parse<string[]>(lines.slice(i).join("\n"), {
          delimiter,
          skipEmptyLines: "greedy",
        });
        if (parsed.errors.some((e) => e.code === "MissingQuotes"))
          throw new Error(
            "El CSV tiene comillas sin cerrar. Revisa el archivo e inténtalo de nuevo.",
          );
        return { header: parsed.data[0].map(norm), rows: parsed.data.slice(1) };
      }
    }
  throw new Error(
    "No se encuentra una cabecera compatible. Comprueba que sea un CSV de LibreView o usa la plantilla de eventos.",
  );
}
const isTime = (s: string) =>
  [
    "sello de tiempo del dispositivo",
    "device timestamp",
    "device time stamp",
  ].includes(s);
const val = (row: string[], index: number) => (row[index] || "").trim();
const numeric = (s: string) =>
  /^\d+(?:[.,]\d+)?$/.test(s) ? Number(s.replace(",", ".")) : NaN;
export function parseLibre(
  files: string[],
  order: DateOrder = "DMY",
): ImportResult {
  const historic: Reading[] = [],
    scans: Reading[] = [],
    sensors = new Map<string, string>();
  let invalid = 0;
  const warnings = new Set<string>();
  for (const text of files) {
    const { header, rows } = csvRows(text, (cells) => cells.some(isTime));
    const ti = header.findIndex(isTime),
      si = header.findIndex((h) =>
        ["numero de serie", "serial number"].includes(h),
      );
    const hi = header.findIndex((h) =>
      /^(historial de glucosa|historic glucose|historical glucose)\s+(mg\/dl|mmol\/l)/.test(
        h,
      ),
    );
    const gi = header.findIndex((h) =>
      /^(escaneo de glucosa|scan glucose|scanned glucose)\s+(mg\/dl|mmol\/l)/.test(
        h,
      ),
    );
    if (hi < 0 && gi < 0)
      throw new Error(
        "No se encuentran columnas de glucosa histórica ni de escaneo con unidades mg/dL o mmol/L.",
      );
    for (const row of rows) {
      if (!val(row, hi) && !val(row, gi)) continue;
      const t = parseTimestamp(val(row, ti), order);
      if (t === null) {
        invalid++;
        continue;
      }
      const serial = val(row, si) || "unknown";
      if (!sensors.has(serial))
        sensors.set(serial, `Sensor ${sensors.size + 1}`);
      for (const [i, source, target] of [
        [hi, "historic", historic],
        [gi, "scan", scans],
      ] as const) {
        const raw = val(row, i);
        if (!raw) continue;
        const glucose =
          numeric(raw) * (header[i].includes("mmol/l") ? 18.0182 : 1);
        if (!Number.isFinite(glucose) || glucose <= 0) {
          invalid++;
          continue;
        }
        target.push({
          timestamp: t,
          localDate: dateKey(t),
          localTime: timeLabel(t),
          glucose,
          source,
          sensorId: sensors.get(serial)!,
        });
      }
    }
  }
  const source = historic.length ? "historic" : "scan";
  const selected = source === "historic" ? historic : scans;
  if (!selected.length)
    throw new Error(
      "No se encontraron lecturas válidas. Revisa el formato de fecha seleccionado y las columnas del archivo.",
    );
  const unique = new Map<number, Reading>();
  let duplicates = 0,
    conflicts = 0;
  for (const r of selected) {
    const prev = unique.get(r.timestamp);
    if (prev) {
      duplicates++;
      if (prev.glucose !== r.glucose) conflicts++;
    } else unique.set(r.timestamp, r);
  }
  if (source === "scan")
    warnings.add(
      "Se usan escaneos: el muestreo manual puede sesgar las métricas de tiempo.",
    );
  if (conflicts)
    warnings.add(
      `${conflicts} timestamps con valores distintos: se conserva la primera lectura importada.`,
    );
  if (invalid) warnings.add(`${invalid} lecturas inválidas descartadas.`);
  const scanMap = new Map<number, Reading>();
  for (const s of scans)
    if (!unique.has(s.timestamp)) scanMap.set(s.timestamp, s);
  return {
    readings: [...unique.values()].sort((a, b) => a.timestamp - b.timestamp),
    scans:
      source === "historic"
        ? [...scanMap.values()].sort((a, b) => a.timestamp - b.timestamp)
        : [],
    invalid,
    duplicates,
    conflicts,
    sensorCount: sensors.size,
    source,
    warnings: [...warnings],
  };
}
export function parseEvents(
  text: string,
  order: DateOrder = "DMY",
): EventImport {
  const { header, rows } = csvRows(
    text,
    (cells) => cells.includes("timestamp") && cells.includes("category"),
  );
  const idx = (name: string) => header.indexOf(name);
  const events: CgmEvent[] = [];
  let invalid = 0,
    duplicates = 0;
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const row of rows) {
    const raw = val(row, idx("timestamp")),
      timestamp = parseTimestamp(raw, order),
      category = val(row, idx("category"));
    const duration = val(row, idx("duration_min")),
      durationMin = duration ? numeric(duration) : undefined;
    if (
      timestamp === null ||
      !category ||
      (durationMin !== undefined &&
        (!Number.isFinite(durationMin) || durationMin < 0))
    ) {
      invalid++;
      continue;
    }
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) && !warnings.length)
      warnings.push(
        "En los eventos ISO se conserva la hora escrita, sin aplicar el huso horario. Debe coincidir con la hora del dispositivo.",
      );
    const comment = val(row, idx("comment")),
      label =
        val(row, idx("label")) ||
        (comment.length <= 80 ? comment : "Sin etiqueta");
    const key = JSON.stringify([
      timestamp,
      category,
      label,
      comment,
      durationMin,
    ]);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    events.push({
      id: `event-${events.length}`,
      timestamp,
      category,
      label: label || "Sin etiqueta",
      comment,
      durationMin,
    });
  }
  if (!events.length)
    throw new Error(
      "No hay eventos válidos. Usa las columnas timestamp, category y comment, y comprueba el formato de fecha.",
    );
  return {
    events: events.sort((a, b) => a.timestamp - b.timestamp),
    invalid,
    duplicates,
    warnings,
  };
}
