import type { CgmEvent, Reading } from "../types";
import { MINUTE } from "./time";
import { median } from "./statistics";
import { lowerBound, windowReadings } from "./metrics";
export function interpolateAt(
  readings: Reading[],
  timestamp: number,
  typical: number,
): number | null {
  const i = lowerBound(readings, timestamp),
    next = readings[i],
    prev = readings[i - 1];
  if (next?.timestamp === timestamp) return next.glucose;
  if (
    !prev ||
    !next ||
    typical <= 0 ||
    next.timestamp - prev.timestamp > 2 * typical
  )
    return null;
  return (
    prev.glucose +
    ((next.glucose - prev.glucose) * (timestamp - prev.timestamp)) /
      (next.timestamp - prev.timestamp)
  );
}
function completeWindow(
  readings: Reading[],
  start: number,
  end: number,
  typical: number,
): Reading[] | null {
  const a = interpolateAt(readings, start, typical),
    b = interpolateAt(readings, end, typical);
  if (a === null || b === null || !readings.length) return null;
  const inside = readings.filter(
    (r) => r.timestamp > start && r.timestamp < end,
  );
  const points = [
    { ...readings[0], timestamp: start, glucose: a },
    ...inside,
    { ...readings[0], timestamp: end, glucose: b },
  ];
  return points.some(
    (r, i) => i > 0 && r.timestamp - points[i - 1].timestamp > 2 * typical,
  )
    ? null
    : points;
}
// Positive incremental area. Integrate crossings of the baseline exactly, not
// by clipping endpoints and overestimating the triangular contribution.
export function incrementalAuc(
  points: { timestamp: number; glucose: number }[],
  baseline: number,
) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].glucose - baseline,
      b = points[i].glucose - baseline,
      dt = (points[i].timestamp - points[i - 1].timestamp) / MINUTE;
    if (a >= 0 && b >= 0) sum += ((a + b) * dt) / 2;
    else if (a > 0) sum += (a * dt * (a / (a - b))) / 2;
    else if (b > 0) sum += (b * dt * (b / (b - a))) / 2;
  }
  return sum;
}
export function analyzeEvent(
  readings: Reading[],
  event: CgmEvent,
  typical: number,
) {
  const t = event.timestamp,
    nearby = windowReadings(readings, t - 15 * MINUTE, t + 240 * MINUTE, true);
  const before = nearby.filter(
    (r) => r.timestamp >= t - 15 * MINUTE && r.timestamp <= t,
  );
  const baseline =
    before.length >= 2 && completeWindow(nearby, t - 15 * MINUTE, t, typical)
      ? median(before.map((r) => r.glucose))
      : null;
  const post = completeWindow(nearby, t, t + 180 * MINUTE, typical);
  const peak = post
    ? post.reduce((a, b) => (b.glucose > a.glucose ? b : a))
    : null;
  const aucPoints = completeWindow(nearby, t, t + 120 * MINUTE, typical);
  let returnMin: number | null = null;
  if (baseline !== null && peak) {
    const after = nearby.filter(
      (r) => r.timestamp > peak.timestamp && r.timestamp <= t + 240 * MINUTE,
    );
    for (const candidate of after) {
      if (Math.abs(candidate.glucose - baseline) > 5) continue;
      const sustained = completeWindow(
        nearby,
        candidate.timestamp,
        candidate.timestamp + 15 * MINUTE,
        typical,
      );
      if (
        candidate.timestamp + 15 * MINUTE <= t + 240 * MINUTE &&
        sustained &&
        sustained.every((r) => Math.abs(r.glucose - baseline) <= 5)
      ) {
        returnMin = (candidate.timestamp - t) / MINUTE;
        break;
      }
    }
  }
  return {
    baseline,
    peak: peak?.glucose ?? null,
    delta: peak && baseline !== null ? peak.glucose - baseline : null,
    timeToPeak: peak ? (peak.timestamp - t) / MINUTE : null,
    auc:
      baseline !== null && aucPoints
        ? incrementalAuc(aucPoints, baseline)
        : null,
    returnMin,
  };
}
export function repeatedMedian(
  readings: Reading[],
  events: CgmEvent[],
  before: number,
  after: number,
  typical: number,
) {
  return Array.from(
    { length: Math.floor((after - before) / 5) + 1 },
    (_, i) => {
      const minute = before + i * 5,
        values = events
          .map((e) =>
            interpolateAt(readings, e.timestamp + minute * MINUTE, typical),
          )
          .filter((x): x is number => x !== null);
      return {
        minute,
        value:
          values.length >= Math.max(2, Math.ceil(events.length / 2))
            ? median(values)
            : null,
        n: values.length,
      };
    },
  );
}
