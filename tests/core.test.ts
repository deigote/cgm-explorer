import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseEvents, parseLibre } from "../src/lib/parsers";
import {
  parseTimestamp,
  dateKey,
  stampLabel,
  timeLabel,
  DAY,
  MINUTE,
} from "../src/lib/time";
import {
  mean,
  median,
  percentile,
  standardDeviation,
  coefficientOfVariation,
  gmi,
} from "../src/lib/statistics";
import {
  agpPercentiles,
  bandIndex,
  dailyMetrics,
  hourlyDistribution,
  quality,
  summarize,
  timeInRange,
  typicalInterval,
} from "../src/lib/metrics";
import {
  analyzeEvent,
  incrementalAuc,
  interpolateAt,
  repeatedMedian,
} from "../src/lib/eventAnalysis";
import { DEFAULTS, type CgmEvent, type Reading } from "../src/types";
import { demoSession } from "../src/lib/demo";
import { validSettings } from "../src/lib/storage";
import { escapeHtml } from "../src/lib/presentation";
const fixture = readFileSync(
  new URL("./fixtures/example.csv", import.meta.url),
  "utf8",
);
const t0 = Date.UTC(2026, 10, 11);
const reading = (minute: number, glucose: number): Reading => ({
  timestamp: t0 + minute * MINUTE,
  localDate: dateKey(t0 + minute * MINUTE),
  localTime: timeLabel(t0 + minute * MINUTE),
  glucose,
  source: "historic",
  sensorId: "Sensor 1",
});
const event: CgmEvent = {
  id: "1",
  timestamp: t0 + 60 * MINUTE,
  category: "Comida",
  label: "Porridge",
  comment: "Avena",
};
describe("Importación Libre", () => {
  it("reproduce las ocho lecturas del spec", () => {
    const data = parseLibre([fixture]);
    expect(data.readings.map((r) => [r.localTime, r.glucose])).toEqual([
      ["17:21", 100],
      ["17:26", 97],
      ["17:31", 108],
      ["17:36", 107],
      ["17:41", 101],
      ["17:46", 101],
      ["17:51", 105],
      ["17:56", 105],
    ]);
    expect(summarize(data.readings)).toMatchObject({
      mean: 103,
      median: 103,
      count: 8,
    });
    expect(data.readings[0].localDate).toBe("2026-11-11");
    expect(data.readings[0].sensorId).toBe("Sensor 1");
    expect(JSON.stringify(data)).not.toContain("SENSOR-DEMO");
  });
  it.skipIf(!process.env.CGM_PRIVATE_FIXTURE)(
    "valida el archivo original local sin copiarlo al repositorio",
    () => {
      const actual = parseLibre([
        readFileSync(process.env.CGM_PRIVATE_FIXTURE!, "utf8"),
      ]);
      expect(actual.readings.map((r) => [r.timestamp, r.glucose])).toEqual(
        parseLibre([fixture]).readings.map((r) => [r.timestamp, r.glucose]),
      );
    },
  );
  it("detecta cabecera tras metadatos, BOM y punto y coma", () => {
    const csv =
      "\uFEFFtexto\nmetadatos;varios\n" + fixture.replaceAll(",", ";");
    expect(parseLibre([csv]).readings).toHaveLength(8);
  });
  it("acepta nombres ingleses y convierte mmol/L", () => {
    const data = parseLibre([
      "Info\nDevice Timestamp;Historic Glucose mmol/L;Scan Glucose mmol/L\n11-11-2026 08:00;5,5;6\n11-11-2026 08:05;6;",
    ]);
    expect(data.readings[0].glucose).toBeCloseTo(99.1001);
    expect(data.readings).toHaveLength(2);
    expect(data.scans).toHaveLength(0);
  });
  it("mantiene historial como principal y no mezcla escaneos", () => {
    const data = parseLibre([
      "Device Timestamp,Historic Glucose mg/dL,Scan Glucose mg/dL\n11-11-2026 08:00,100,105\n11-11-2026 08:03,,106\n11-11-2026 08:05,110,",
    ]);
    expect(data.readings.map((r) => r.glucose)).toEqual([100, 110]);
    expect(data.scans.map((r) => r.glucose)).toEqual([106]);
  });
  it("usa escaneos cuando no hay historial válido", () => {
    const data = parseLibre([
      "Device Timestamp,Historic Glucose mg/dL,Scan Glucose mg/dL\n11-11-2026 08:00,,105",
    ]);
    expect(data.source).toBe("scan");
    expect(data.readings[0].glucose).toBe(105);
  });
  it("ordena y deduplica varios archivos y contabiliza conflictos", () => {
    const a =
      "Device Timestamp,Historic Glucose mg/dL\n11-11-2026 08:05,100\n11-11-2026 08:00,90";
    const b = "Device Timestamp,Historic Glucose mg/dL\n11-11-2026 08:05,101";
    const d = parseLibre([a, b]);
    expect(d.duplicates).toBe(1);
    expect(d.conflicts).toBe(1);
    expect(d.readings.map((r) => r.glucose)).toEqual([90, 100]);
  });
  it("descarta filas inválidas sin confundirlas con filas vacías", () => {
    const d = parseLibre([
      "Device Timestamp,Historic Glucose mg/dL\n31-02-2026 08:00,100\n11-11-2026 08:00,0\n11-11-2026 08:05,abc\n11-11-2026 08:10,105\n11-11-2026 08:15,",
    ]);
    expect(d.invalid).toBe(3);
    expect(d.readings).toHaveLength(1);
  });
  it("rechaza CSV incompatibles y comillas rotas", () => {
    expect(() => parseLibre(["a,b\n1,2"])).toThrow();
    expect(() =>
      parseEvents(
        'timestamp,category,comment\n11-11-2026 08:00,Comida,"sin cierre',
      ),
    ).toThrow(/comillas/);
  });
});
describe("Reloj local del dispositivo", () => {
  it("conserva la hora escrita en cualquier TZ del sistema", () => {
    const t = parseTimestamp("11-11-2026 17:21")!;
    expect(timeLabel(t)).toBe("17:21");
    expect(stampLabel(t)).toBe("11 nov 2026 · 17:21");
  });
  it("acepta segundos, AM/PM, ISO y offsets sin alterar el reloj", () => {
    expect(timeLabel(parseTimestamp("11/12/2026 5:21 PM", "MDY")!)).toBe(
      "17:21",
    );
    expect(dateKey(parseTimestamp("11/12/2026 5:21 PM", "MDY")!)).toBe(
      "2026-11-12",
    );
    expect(parseTimestamp("2026-11-11T17:21:00+02:00")).toBe(
      parseTimestamp("11-11-2026 17:21"),
    );
    expect(parseTimestamp("2026-11-11T17:21:00Z")).toBe(
      parseTimestamp("11-11-2026 17:21"),
    );
  });
  it("valida fechas reales y años bisiestos", () => {
    expect(parseTimestamp("29-02-2024 12:30")).not.toBeNull();
    for (const s of [
      "29-02-2026 12:30",
      "31-04-2026 08:00",
      "11-11-2026 24:00",
      "11-11-2026 08:60",
      "00-11-2026 08:00",
      "11-00-2026 08:00",
      "11-11-2026 13:00 PM",
    ])
      expect(parseTimestamp(s)).toBeNull();
  });
});
describe("Eventos", () => {
  it("acepta columnas mínimas, categorías libres y comas entrecomilladas", () => {
    const d = parseEvents(
      'timestamp,category,comment\n11-11-2026 08:30,Frío,"Baño, 3 minutos"',
    );
    expect(d.events[0]).toMatchObject({
      category: "Frío",
      label: "Baño, 3 minutos",
      comment: "Baño, 3 minutos",
      durationMin: undefined,
    });
  });
  it("acepta duración, ISO y etiqueta explícita; avisa sobre offset", () => {
    const d = parseEvents(
      "timestamp;category;label;comment;duration_min\n2026-11-11T08:30:00Z;Comida;Porridge;Avena;15",
    );
    expect(d.events[0]).toMatchObject({ label: "Porridge", durationMin: 15 });
    expect(d.warnings).toHaveLength(1);
  });
  it("descarta duraciones inválidas y deduplica eventos exactos", () => {
    const row = "11-11-2026 08:30,Comida,Comida,20";
    const d = parseEvents(
      `timestamp,category,comment,duration_min\n${row}\n${row}\n11-11-2026 10:00,Comida,a,-2`,
    );
    expect(d.events).toHaveLength(1);
    expect(d.duplicates).toBe(1);
    expect(d.invalid).toBe(1);
  });
});
describe("Estadística y ponderación temporal", () => {
  it("calcula media, mediana, percentiles tipo 7, DE poblacional, CV y GMI", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(percentile([0, 10, 20, 30], 0.25)).toBe(7.5);
    expect(standardDeviation([1, 2, 3])).toBeCloseTo(Math.sqrt(2 / 3));
    expect(coefficientOfVariation([1, 2, 3])).toBeCloseTo(
      (Math.sqrt(2 / 3) / 2) * 100,
    );
    expect(gmi(103)).toBeCloseTo(5.77376);
  });
  it("define exactamente las fronteras de las bandas", () => {
    expect(
      [69, 70, 99, 100, 140, 141, 180, 181].map((v) =>
        bandIndex(v, DEFAULTS.bands),
      ),
    ).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it("pondera por duración e ignora una laguna larga y la última muestra", () => {
    const r = [
      reading(0, 60),
      reading(5, 100),
      reading(15, 200),
      reading(20, 100),
      reading(80, 100),
      reading(85, 100),
    ];
    const typical = typicalInterval(r);
    expect(typical).toBe(5 * MINUTE);
    const t = timeInRange(r, DEFAULTS, t0, t0 + DAY);
    expect(t.observed).toBe(25 * MINUTE);
    expect(t.inRange).toBe(15 * MINUTE);
    expect(t.below).toBe(5 * MINUTE);
    expect(t.aboveLast).toBe(5 * MINUTE);
    expect(t.coverage).toBeCloseTo((25 / 1440) * 100);
    expect(t.bandTimes.reduce((a, b) => a + b)).toBe(t.observed);
    expect(quality(r, typical)).toEqual({ gaps: 1, largest: 60 * MINUTE });
  });
  it("cuenta el TIR inclusivo y respeta límites de periodo", () => {
    const r = [reading(0, 70), reading(5, 140), reading(10, 180)];
    const t = timeInRange(r, DEFAULTS, t0 + 2 * MINUTE, t0 + 8 * MINUTE);
    expect(t.inRange).toBe(6 * MINUTE);
    expect(t.observed).toBe(6 * MINUTE);
    expect(t.coverage).toBe(100);
  });
  it("una sola lectura no inventa tiempo observado", () => {
    expect(
      timeInRange([reading(0, 100)], DEFAULTS, t0, t0 + DAY).observed,
    ).toBe(0);
  });
  it("el fixture tiene 35 minutos observados, no un día de cobertura", () => {
    const d = parseLibre([fixture]);
    const time = timeInRange(d.readings, DEFAULTS, t0, t0 + DAY);
    expect(time.observed).toBe(35 * MINUTE);
    expect(time.coverage).toBeCloseTo((35 / 1440) * 100);
    expect(time.inRange).toBe(time.observed);
  });
  it("reparte intervalos que cruzan medianoche entre los días", () => {
    const r = [reading(1435, 100), reading(1440, 200), reading(1445, 100)];
    const days = dailyMetrics(r, DEFAULTS, t0, t0 + 2 * DAY, 5 * MINUTE);
    expect(days[0].times.observed).toBe(5 * MINUTE);
    expect(days[1].times.observed).toBe(5 * MINUTE);
    expect(days[0].tir).toBe(100);
    expect(days[1].tir).toBe(0);
  });
  it("el perfil agregado da el mismo peso a cada día", () => {
    const r = [
      reading(0, 100),
      reading(5, 100),
      reading(10, 100),
      reading(1440, 200),
      reading(2880, 300),
    ];
    const p = agpPercentiles(r)[0];
    expect(p.n).toBe(3);
    expect(p.median).toBe(200);
    expect(p.p10).toBe(120);
  });
  it("usa bigotes de 1,5 IQR e identifica atípicos", () => {
    const h = hourlyDistribution(
      [100, 101, 102, 103, 104, 200].map((v, i) => reading(i, v)),
    )[0];
    expect(h.outliers).toEqual([200]);
    expect(h.high).toBe(104);
  });
});
describe("Respuestas a eventos", () => {
  const response = Array.from({ length: 61 }, (_, i) => {
    const m = i * 5;
    return reading(
      m,
      m <= 60
        ? 100
        : m <= 120
          ? 100 + (m - 60)
          : m <= 180
            ? 160 - (m - 120)
            : 100,
    );
  });
  it("calcula baseline, pico, delta, tiempo al pico, área y retorno sostenido", () => {
    const a = analyzeEvent(response, event, 5 * MINUTE);
    expect(a.baseline).toBe(100);
    expect(a.peak).toBe(160);
    expect(a.delta).toBe(60);
    expect(a.timeToPeak).toBe(60);
    expect(a.auc).toBeCloseTo(3600);
    expect(a.returnMin).toBe(115);
  });
  it("no calcula pico/iAUC en ventanas incompletas ni cruza lagunas", () => {
    const sparse = response.filter(
      (r) => r.timestamp < t0 + 100 * MINUTE || r.timestamp > t0 + 140 * MINUTE,
    );
    const a = analyzeEvent(sparse, event, 5 * MINUTE);
    expect(a.peak).toBeNull();
    expect(a.auc).toBeNull();
    expect(a.returnMin).toBeNull();
    expect(interpolateAt(sparse, t0 + 120 * MINUTE, 5 * MINUTE)).toBeNull();
  });
  it("no extrapola fuera de los datos", () => {
    expect(interpolateAt(response, t0 - MINUTE, 5 * MINUTE)).toBeNull();
    expect(
      analyzeEvent(response, { ...event, timestamp: t0 }, 5 * MINUTE).baseline,
    ).toBeNull();
  });
  it("integra correctamente cruces de baseline y no suma áreas negativas", () => {
    expect(incrementalAuc([reading(0, 90), reading(10, 110)], 100)).toBe(25);
    expect(incrementalAuc([reading(0, 110), reading(10, 90)], 100)).toBe(25);
    expect(incrementalAuc([reading(0, 90), reading(10, 95)], 100)).toBe(0);
  });
  it("no muestra una mediana de repeticiones con una sola curva disponible", () => {
    const points = repeatedMedian(
      response,
      [event, { ...event, id: "2", timestamp: t0 + 10 * DAY }],
      -30,
      120,
      5 * MINUTE,
    );
    expect(points.every((p) => p.value === null)).toBe(true);
  });
});
describe("Seguridad, preferencias y volumen", () => {
  it("escapa etiquetas potencialmente ejecutables en tooltips", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });
  it("valida preferencias almacenadas", () => {
    expect(validSettings(DEFAULTS)).toBe(true);
    expect(validSettings({ ...DEFAULTS, bands: [100, 70, 140, 180] })).toBe(
      false,
    );
    expect(validSettings({ ...DEFAULTS, target: [140, 70] })).toBe(false);
  });
  it("la demostración es determinista y contiene lagunas y eventos repetidos", () => {
    const d = demoSession();
    expect(d.data.readings).toHaveLength(3972);
    expect(d.events.filter((e) => e.label === "Porridge")).toHaveLength(14);
    expect(quality(d.data.readings, 5 * MINUTE).gaps).toBe(2);
  });
  it("procesa 50.000 lecturas sin perder puntos", () => {
    const rows = Array.from({ length: 50000 }, (_, i) => {
      const r = reading(i * 5, 80 + (i % 80));
      return `${r.localDate}T${r.localTime},${r.glucose}`;
    });
    const d = parseLibre([
      "Device Timestamp,Historic Glucose mg/dL\n" + rows.join("\n"),
    ]);
    expect(d.readings).toHaveLength(50000);
    expect(summarize(d.readings).count).toBe(50000);
    expect(agpPercentiles(d.readings)).toHaveLength(96);
    expect(
      dailyMetrics(d.readings, DEFAULTS, t0, t0 + 174 * DAY, 5 * MINUTE),
    ).toHaveLength(174);
  }, 10000);
});
