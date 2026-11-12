export const mean = (v: number[]) =>
  v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
export function percentileSorted(v: number[], p: number) {
  if (!v.length) return NaN;
  const index = (v.length - 1) * Math.min(1, Math.max(0, p)),
    lo = Math.floor(index),
    hi = Math.ceil(index);
  return v[lo] + (v[hi] - v[lo]) * (index - lo);
}
export const percentile = (v: number[], p: number) =>
  percentileSorted(
    [...v].sort((a, b) => a - b),
    p,
  );
export const median = (v: number[]) => percentile(v, 0.5);
export function standardDeviation(v: number[]) {
  const avg = mean(v);
  return v.length ? Math.sqrt(mean(v.map((x) => (x - avg) ** 2))) : NaN;
}
export const coefficientOfVariation = (v: number[]) =>
  (standardDeviation(v) / mean(v)) * 100;
export const gmi = (avg: number) => 3.31 + 0.02392 * avg;
