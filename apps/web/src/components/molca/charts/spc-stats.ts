export const mean = (xs: readonly number[]) =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;

/** Sample standard deviation (n − 1). */
export function stdev(xs: readonly number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Linear-interpolated quantile (same as Excel QUARTILE.INC / NumPy default). */
export function quantile(sorted: readonly number[], q: number) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export const normalPdf = (x: number, mu: number, sigma: number) =>
  Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));

/** Standard normal CDF Φ(z) (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number) {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Ordinary least squares y = intercept + slope·x, with Pearson r and R². */
export function linearRegression(points: readonly { x: number; y: number }[]) {
  const n = points.length;
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  const slope = sxx ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
  return { n, slope, intercept, r, r2: r * r, predict: (x: number) => intercept + slope * x };
}

/** "Nice" axis ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5) {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  const start = Math.ceil(min / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(+v.toPrecision(12));
  return ticks;
}

/** Decimal places needed to show `step` without noise (0.05 → 2). */
export const decimalsFor = (step: number) =>
  Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9)));

/**
 * Deterministic pseudo-random generator (mulberry32) + Box–Muller, for building FIXED demo data
 * at module level. Never call Math.random() in render — server and client output must match.
 */
export function seededNormal(seed: number) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return (mu = 0, sigma = 1) => {
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

export const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

/** Nice ticks that always COVER [min, max] (first tick ≤ min, last tick ≥ max) — use as axis domain. */
export function niceDomain(min: number, max: number, count = 5) {
  const t = niceTicks(min, max, count);
  if (t.length < 2) return [min, max];
  const step = t[1] - t[0];
  if (t[0] > min + 1e-12) t.unshift(+(t[0] - step).toPrecision(12));
  if (t[t.length - 1] < max - 1e-12) t.push(+(t[t.length - 1] + step).toPrecision(12));
  return t;
}
