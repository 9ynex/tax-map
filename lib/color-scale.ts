/**
 * Small hand-rolled color interpolator for the choropleth (docs/frontend.md
 * #3: color the map by effective rate). No d3-scale dependency — three
 * stops (low/mid/high rate) linearly interpolated in RGB space is enough
 * for a map with 13 regions.
 */
const STOPS: { at: number; color: [number, number, number] }[] = [
  { at: 0, color: [45, 212, 168] }, // --rate-low
  { at: 0.5, color: [242, 184, 75] }, // --rate-mid
  { at: 1, color: [241, 101, 101] }, // --rate-high
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Maps a value in [min, max] to a color along the low/mid/high rate scale.
 * Clamped at both ends so an outlier region doesn't blow out the scale.
 * `higherIsBetter` flips the direction — e.g. take-home pay should color
 * high values green, unlike effective rate or total tax where low is green.
 */
export function rateToColor(
  value: number,
  min: number,
  max: number,
  higherIsBetter = false,
): string {
  if (max <= min) return rgbToHex(STOPS[0]!.color);
  const rawT = (value - min) / (max - min);
  const t = Math.min(1, Math.max(0, higherIsBetter ? 1 - rawT : rawT));

  let lower = STOPS[0]!;
  let upper = STOPS[STOPS.length - 1]!;
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i]!;
    const b = STOPS[i + 1]!;
    if (t >= a.at && t <= b.at) {
      lower = a;
      upper = b;
      break;
    }
  }

  const span = upper.at - lower.at || 1;
  const localT = (t - lower.at) / span;
  const color: [number, number, number] = [
    lerp(lower.color[0], upper.color[0], localT),
    lerp(lower.color[1], upper.color[1], localT),
    lerp(lower.color[2], upper.color[2], localT),
  ];
  return rgbToHex(color);
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
