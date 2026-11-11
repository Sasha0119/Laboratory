/**
 * Strict parsing for typed numeric inputs.
 *
 * `Number.parseFloat` is far too forgiving for a field a student types into:
 * it reads "12abc" as 12 and "1.000,5" as 1, silently dropping whatever it
 * did not understand. This parser accepts a value only when the WHOLE text is
 * a plain number, and otherwise says why it refused, so the field can explain
 * instead of guessing.
 *
 * Accepted:
 *   - an optional sign: "+", "-" or the Unicode minus "−" (common when pasting)
 *   - digits with at most one decimal separator, which may be "." or ","
 *     — several of the app's languages write 1,5 for one and a half, so
 *     "1,5" and "1.5" both mean 1.5
 *   - a leading or trailing separator: ".5", "5." (a half-typed decimal)
 *   - surrounding whitespace, including non-breaking spaces from a paste
 *
 * Refused as 'ambiguous' (looks like digit grouping — we will not guess
 * whether "1.000,5" means 1000.5 or something else):
 *   - both "." and "," in one number: "1.000,5", "1,000.5"
 *   - the same separator more than once: "1.000.000", "1,000,000"
 *   - spaces between digit groups: "1 000"
 *
 * Refused as 'invalid': anything else — letters ("12abc"), exponents ("1e5"),
 * "Infinity", "NaN", hex, lone signs or separators, or a value too large to
 * represent.
 *
 * A single separator is always decimal, so "1,000" is 1.0, not one thousand.
 * That keeps the rule simple and predictable; a value that then falls out of
 * range is clamped by the field with a visible message, never silently.
 */

export type ParseFailure = 'empty' | 'invalid' | 'ambiguous';

export type ParseResult = { ok: true; value: number } | { ok: false; reason: ParseFailure };

/** Any whitespace. In JS `\s` already covers NBSP, figure and thin spaces from a paste. */
const HAS_SPACE = /\s/;

const PLAIN_NUMBER = /^[+-]?(\d+[.,]?\d*|[.,]\d+)$/;

/** Digit groups separated by spaces, e.g. "1 000" or "12 345,6". */
const SPACE_GROUPED = /^[+-]?\d{1,3}(\s\d{3})+([.,]\d*)?$/;

export function parseNumberInput(raw: string): ParseResult {
  const text = raw.replace(/−/g, '-').trim();
  if (text === '') return { ok: false, reason: 'empty' };

  if (SPACE_GROUPED.test(text)) return { ok: false, reason: 'ambiguous' };
  if (HAS_SPACE.test(text)) return { ok: false, reason: 'invalid' };

  const dots = (text.match(/\./g) ?? []).length;
  const commas = (text.match(/,/g) ?? []).length;
  if (dots + commas > 1) {
    // Only call it a grouping problem when it really is digits and separators.
    return /^[+-]?[\d.,]+$/.test(text) && /\d/.test(text)
      ? { ok: false, reason: 'ambiguous' }
      : { ok: false, reason: 'invalid' };
  }

  if (!PLAIN_NUMBER.test(text)) return { ok: false, reason: 'invalid' };

  const value = Number(text.replace(',', '.'));
  if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' };
  // Normalise -0 to 0 so it formats and compares as the user expects.
  return { ok: true, value: value === 0 ? 0 : value };
}

/**
 * Round to the number of decimals a field displays. The field commits this
 * rounded value, so what is on screen is always exactly what is simulated.
 */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}
