import type { Reading, Settings } from "../types";
import { DAY, MINUTE, dateBoundary, dayKeys, minuteOfDay } from "./time";
import {
  mean,
  median,
  percentileSorted,
  standardDeviation,
  gmi,
} from "./statistics";
export function typicalInterval(readings: Reading[]): number {
  const deltas = readings
    .slice(1)
    .map((r, i) => r.timestamp - readings[i].timestamp)
    .filter((x) => x > 0);
  return deltas.length ? median(deltas) : 0;
}
export function bandIndex(g: number, b: Settings["bands"]) {
  return g < b[0] ? 0 : g < b[1] ? 1 : g <= b[2] ? 2 : g <= b[3] ? 3 : 4;
}
export interface TimeStats {
  observed: number;
  bandTimes: number[];
  counts: number[];
  inRange: number;
  below: number;
  above: number;
  aboveLast: number;
  coverage: number;
}
export function timeInRange(
  readings: Reading[],
  settings: Settings,
  start: number,
  end: number,
  typical = typicalInterval(readings),
): TimeStats {
  const result: TimeStats = {
    observed: 0,
    bandTimes: [0, 0, 0, 0, 0],
    counts: [0, 0, 0, 0, 0],
    inRange: 0,
    below: 0,
    above: 0,
    aboveLast: 0,
    coverage: 0,
  };
  for (let i = 0; i < readings.length; i++) {
    const r = readings[i],
      band = bandIndex(r.glucose, settings.bands);
    if (r.timestamp >= start && r.timestamp < end) result.counts[band]++;
    const next = readings[i + 1];
    if (!next || !typical || next.timestamp - r.timestamp > typical * 3)
      continue;
    const duration = Math.max(
      0,
      Math.min(next.timestamp, end) - Math.max(r.timestamp, start),
    );
    result.observed += duration;
    result.bandTimes[band] += duration;
    if (r.glucose >= settings.target[0] && r.glucose <= settings.target[1])
      result.inRange += duration;
    if (r.glucose < settings.target[0]) result.below += duration;
    if (r.glucose > settings.target[1]) result.above += duration;
    if (r.glucose > settings.bands[3]) result.aboveLast += duration;
  }
  result.coverage = end > start ? (result.observed / (end - start)) * 100 : 0;
  return result;
}
export function summarize(readings: Reading[]) {
  const values = readings.map((r) => r.glucose).sort((a, b) => a - b),
    avg = mean(values),
    sd = standardDeviation(values);
  return {
    count: values.length,
    mean: avg,
    median: percentileSorted(values, 0.5),
    min: values[0] ?? NaN,
    max: values.at(-1) ?? NaN,
    sd,
    cv: (sd / avg) * 100,
    gmi: gmi(avg),
  };
}
export function quality(readings: Reading[], typical: number) {
  const gaps = readings
    .slice(1)
    .map((r, i) => r.timestamp - readings[i].timestamp)
    .filter((d) => typical > 0 && d > typical * 3);
  return { gaps: gaps.length, largest: gaps.length ? Math.max(...gaps) : 0 };
}
export function hourlyDistribution(readings: Reading[]) {
  const hours: number[][] = Array.from({ length: 24 }, () => []);
  for (const r of readings)
    hours[Math.floor(minuteOfDay(r.timestamp) / 60)].push(r.glucose);
  return hours.map((values, hour) => {
    values.sort((a, b) => a - b);
    const q1 = percentileSorted(values, 0.25),
      med = percentileSorted(values, 0.5),
      q3 = percentileSorted(values, 0.75),
      iqr = q3 - q1;
    const inner = values.filter(
      (v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr,
    );
    return {
      hour,
      n: values.length,
      q1,
      median: med,
      q3,
      low: inner[0],
      high: inner.at(-1),
      outliers: values.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr),
    };
  });
}
export function agpPercentiles(readings: Reading[], binSize = 15) {
  // One median per day/bin prevents days with denser sampling dominating the AGP.
  const bins = Array.from(
    { length: 1440 / binSize },
    () => new Map<string, number[]>(),
  );
  for (const r of readings) {
    const bin = bins[Math.floor(minuteOfDay(r.timestamp) / binSize)];
    const values = bin.get(r.localDate) || [];
    values.push(r.glucose);
    bin.set(r.localDate, values);
  }
  return bins.map((days, i) => {
    const v = [...days.values()].map(median).sort((a, b) => a - b);
    return {
      minute: i * binSize + binSize / 2,
      n: v.length,
      p10: percentileSorted(v, 0.1),
      p25: percentileSorted(v, 0.25),
      median: percentileSorted(v, 0.5),
      p75: percentileSorted(v, 0.75),
      p90: percentileSorted(v, 0.9),
    };
  });
}
export function heatmapData(readings: Reading[]) {
  const cells = new Map<
    string,
    { day: string; hour: number; values: number[] }
  >();
  for (const r of readings) {
    const hour = Math.floor(minuteOfDay(r.timestamp) / 60),
      key = `${r.localDate}-${hour}`;
    if (!cells.has(key)) cells.set(key, { day: r.localDate, hour, values: [] });
    cells.get(key)!.values.push(r.glucose);
  }
  return [...cells.values()].map((c) => ({
    day: c.day,
    hour: c.hour,
    median: median(c.values),
    n: c.values.length,
  }));
}
export function dailyMetrics(
  readings: Reading[],
  settings: Settings,
  start: number,
  end: number,
  typical: number,
) {
  const groups = new Map<string, Reading[]>();
  for (const r of readings) {
    if (!groups.has(r.localDate)) groups.set(r.localDate, []);
    groups.get(r.localDate)!.push(r);
  }
  return dayKeys(start, end).map((day) => {
    const from = dateBoundary(day),
      values = groups.get(day) || [];
    // Include the preceding sample when its supported interval crosses midnight.
    const first = lowerBound(readings, from),
      last = lowerBound(readings, from + DAY);
    const times = timeInRange(
      readings.slice(
        Math.max(0, first - 1),
        Math.min(readings.length, last + 1),
      ),
      settings,
      from,
      from + DAY,
      typical,
    );
    return {
      day,
      readings: values,
      ...summarize(values),
      times,
      tir: times.observed ? (times.inRange / times.observed) * 100 : NaN,
      below: times.observed ? (times.below / times.observed) * 100 : NaN,
      above: times.observed ? (times.above / times.observed) * 100 : NaN,
    };
  });
}
export function lowerBound(readings: Reading[], t: number) {
  let lo = 0,
    hi = readings.length;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (readings[m].timestamp < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}
export function windowReadings(
  readings: Reading[],
  start: number,
  end: number,
  neighbors = false,
) {
  const a = lowerBound(readings, start),
    b = lowerBound(readings, end + 1);
  return readings.slice(
    Math.max(0, a - (neighbors ? 1 : 0)),
    Math.min(readings.length, b + (neighbors ? 1 : 0)),
  );
}
export const durationLabel = (ms: number) =>
  ms < MINUTE
    ? `${Math.round(ms / 1000)} s`
    : ms < 60 * MINUTE
      ? `${+(ms / MINUTE).toFixed(1)} min`
      : `${Math.floor(ms / (60 * MINUTE))} h ${Math.round(ms / MINUTE) % 60} min`;
