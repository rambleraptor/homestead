/**
 * Fraction formatting utilities.
 *
 * Recipes store ingredient quantities as decimals (e.g. `0.5`), but cooks
 * read them as fractions (`1/2`). `decimalToFraction` rounds to the nearest
 * common cooking fraction (halves, thirds, quarters, fifths, sixths,
 * eighths) and falls back to a trimmed decimal when nothing matches.
 */

const COOKING_DENOMINATORS = [2, 3, 4, 5, 6, 8] as const;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Render a non-negative decimal as a fraction string.
 *
 * Examples:
 *   0.5  → "1/2"
 *   0.25 → "1/4"
 *   1.5  → "1 1/2"
 *   2    → "2"
 *   0.42 → "0.42"  (no nearby common fraction)
 *
 * @param value - The decimal to format.
 * @param tolerance - How close to a fraction the value must be to use it.
 *                    Defaults to 0.005 (~half a percent).
 */
export function decimalToFraction(value: number, tolerance = 0.005): string {
  if (!Number.isFinite(value) || value < 0) return '';

  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < tolerance) return String(rounded);

  const whole = Math.floor(value);
  const remainder = value - whole;

  let best: { num: number; den: number; err: number } | null = null;
  for (const den of COOKING_DENOMINATORS) {
    const num = Math.round(remainder * den);
    if (num <= 0 || num >= den) continue;
    const err = Math.abs(remainder - num / den);
    if (err < tolerance && (best === null || err < best.err)) {
      const g = gcd(num, den);
      best = { num: num / g, den: den / g, err };
    }
  }

  if (best) {
    const frac = `${best.num}/${best.den}`;
    return whole > 0 ? `${whole} ${frac}` : frac;
  }

  return String(Number(value.toFixed(2)));
}
