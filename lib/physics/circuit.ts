/**
 * Single-loop DC circuits: a battery, one or two bulbs, and a switch.
 *
 * Steady-state Ohm's Law only — there is no time integration here, unlike
 * `drag.ts` or `collision.ts`. Every value below is exact given the current
 * inputs, which is what lets the UI stay purely reactive with no Run button:
 * change a slider and the new current is simply computed again.
 *
 * Sign/units convention: volts, ohms, amps, watts throughout.
 */

export type WiringMode = 'series' | 'parallel';

export interface BulbInput {
  /** Ohms, > 0. */
  resistance: number;
}

export interface CircuitInput {
  /** Battery EMF, volts. */
  voltage: number;
  switchClosed: boolean;
  bulbCount: 1 | 2;
  /** Only consulted when bulbCount is 2. */
  wiring: WiringMode;
  bulbs: BulbInput[];
  /**
   * Per-bulb: true once a filament has already burned out. A burned-out bulb
   * behaves as an open circuit (infinite resistance) regardless of what its
   * resistance dial says, which is what makes a burnout in a series loop kill
   * the other bulb too, while a parallel one leaves its neighbour untouched.
   */
  burnedOut: boolean[];
}

export interface BulbOutput {
  resistance: number;
  /** Amps flowing through this bulb. Zero if the loop is open or it is burned out. */
  current: number;
  /** Volts dropped across this bulb. */
  voltage: number;
  /** Watts dissipated in this bulb. */
  power: number;
  /** The most this bulb can safely dissipate before its filament fails. */
  safePower: number;
  /** Whether the bulb is drawing more than its safe power *right now*, intact or not. */
  overloaded: boolean;
  burnedOut: boolean;
  /**
   * 0..1 glow intensity, from the power the bulb actually dissipates:
   * sqrt(P / BULB_RATED_POWER). Same reference for every bulb, so more power
   * always means a brighter bulb — two bulbs side by side compare honestly.
   * The square root is a perceptual curve (the eye responds roughly to the
   * square root of light output), so a dim bulb is still visibly lit; it is
   * monotonic, so the order never changes. It reaches exactly 1 at the
   * rated power, which is also the burnout threshold.
   */
  brightness: number;
}

export interface CircuitOutput {
  /** Ohms. Infinity when the loop cannot carry current at all. */
  totalResistance: number;
  /** Amps supplied by the battery. */
  totalCurrent: number;
  /** Watts delivered by the battery, i.e. the sum of every bulb's power. */
  totalPower: number;
  bulbs: BulbOutput[];
}

/**
 * The power every bulb is rated for, in watts — a small 25 W lamp.
 *
 * It is the single reference for both brightness and burnout:
 *   - brightness = sqrt(P / BULB_RATED_POWER), so full glow means "at its
 *     rating", and a bulb dissipating more power is always brighter;
 *   - a bulb whose power exceeds its rating burns out.
 *
 * Previously the reference was a 12 V rating (safe power 12²/R). That made
 * brightness reduce to V/12, independent of R, so two different bulbs in
 * parallel always looked identical even when one drew twice the current.
 *
 * 25 W keeps ordinary setups well inside the scale: the default 9 V across
 * 20 Ω is 4 W (40 % glow), and 12 V across 10 Ω and 20 Ω in parallel is
 * 14.4 W and 7.2 W (76 % and 54 %). Low resistance at high voltage still
 * burns a bulb out — 24 V across 20 Ω is 28.8 W.
 */
export const BULB_RATED_POWER = 25;

/** The most a bulb can dissipate before its filament fails, in watts. */
export function safePowerFor(): number {
  return BULB_RATED_POWER;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Effective resistance for one bulb slot: infinite once its filament has gone. */
function effectiveResistance(bulb: BulbInput, burnedOut: boolean): number {
  return burnedOut ? Infinity : bulb.resistance;
}

/**
 * R_total for up to two resistances in series or parallel. Handles an
 * infinite (burned-out) branch correctly: series with any infinite member is
 * infinite (the loop is broken); parallel with one infinite member reduces to
 * just the other one (its neighbour is unaffected).
 */
function combine(r0: number, r1: number | undefined, wiring: WiringMode): number {
  if (r1 === undefined) return r0;
  if (wiring === 'series') return r0 + r1;
  if (!Number.isFinite(r0) && !Number.isFinite(r1)) return Infinity;
  if (!Number.isFinite(r0)) return r1;
  if (!Number.isFinite(r1)) return r0;
  return (r0 * r1) / (r0 + r1);
}

export function resolveCircuit(input: CircuitInput): CircuitOutput {
  const bulbs = input.bulbs.slice(0, input.bulbCount);
  const wiring: WiringMode = input.bulbCount === 2 ? input.wiring : 'series';
  const rEff = bulbs.map((b, i) => effectiveResistance(b, !!input.burnedOut[i]));

  const totalResistance = combine(rEff[0], rEff[1], wiring);
  const closed =
    input.switchClosed && Number.isFinite(totalResistance) && totalResistance > 0;
  const totalCurrent = closed ? input.voltage / totalResistance : 0;

  const bulbOutputs: BulbOutput[] = bulbs.map((bulb, i) => {
    const burnedOut = !!input.burnedOut[i];
    let current = 0;
    let voltage = 0;

    if (closed && !burnedOut) {
      if (bulbs.length === 1 || wiring === 'series') {
        // Same current everywhere in a series loop; each bulb takes its share
        // of the battery voltage in proportion to its own resistance.
        current = totalCurrent;
        voltage = current * bulb.resistance;
      } else {
        // Parallel: every intact bulb sees the full battery voltage, and
        // draws whatever current its own resistance allows.
        voltage = input.voltage;
        current = voltage / bulb.resistance;
      }
    }

    const power = voltage * current;
    const safePower = safePowerFor();
    const overloaded = !burnedOut && power > safePower;
    const brightness = burnedOut ? 0 : clamp01(Math.sqrt(power / safePower));

    return {
      resistance: bulb.resistance,
      current,
      voltage,
      power,
      safePower,
      overloaded,
      burnedOut,
      brightness,
    };
  });

  const totalPower = bulbOutputs.reduce((sum, b) => sum + b.power, 0);

  return { totalResistance, totalCurrent, totalPower, bulbs: bulbOutputs };
}
