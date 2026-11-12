import type { Session, Reading, CgmEvent } from "../types";
import { DAY, MINUTE, dateKey, timeLabel } from "./time";
export function demoSession(): Session {
  const readings: Reading[] = [],
    events: CgmEvent[] = [],
    start = Date.UTC(2026, 9, 26);
  for (let d = 0; d < 14; d++) {
    for (let m = 0; m < 1440; m += 5) {
      if ((d === 4 && m >= 630 && m < 790) || (d === 10 && m >= 110 && m < 250))
        continue;
      const t = start + d * DAY + m * MINUTE;
      const bump = (center: number, scale: number, width: number) =>
        scale * Math.exp(-(((m - center) / width) ** 2));
      const glucose = Math.round(
        91 +
          8 * Math.sin(((m - 430) / 1440) * Math.PI * 2) +
          4 * Math.sin(m * 0.043 + d * 1.7) +
          bump(570, 38 + (d % 4) * 7, 55) +
          bump(860, 45 + (d % 3) * 9, 70) +
          bump(1250, 30 + (d % 5) * 7, 55) -
          (d === 8 ? bump(260, 30, 70) : 0) +
          (d === 6 ? bump(865, 53, 20) : 0),
      );
      readings.push({
        timestamp: t,
        localDate: dateKey(t),
        localTime: timeLabel(t),
        glucose,
        source: "historic",
        sensorId: "Sensor 1",
      });
    }
    for (const [minute, category, label, comment, duration] of [
      [510, "Comida", "Porridge", "Avena, leche y fruta", 15],
      [810, "Comida", d % 2 ? "Arroz" : "Pasta", "Comida del mediodía", 25],
      [
        1080,
        "Actividad Física",
        d % 2 ? "Paseo" : "Fuerza",
        "Sesión de ejemplo",
        45,
      ],
      [1200, "Comida", "Cena", "Verduras y proteína", 25],
    ] as const)
      events.push({
        id: `demo-${d}-${minute}`,
        timestamp: start + d * DAY + minute * MINUTE,
        category,
        label,
        comment,
        durationMin: duration,
      });
  }
  return {
    data: {
      readings,
      scans: [],
      invalid: 0,
      duplicates: 0,
      conflicts: 0,
      sensorCount: 1,
      source: "historic",
      warnings: [],
    },
    events,
    importedAt: "Datos simulados",
    eventInvalid: 0,
  };
}
