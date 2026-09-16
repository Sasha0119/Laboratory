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
   * 0..1 glow intensity. A perceptual (square-root) curve, so the tile reads
   * as meaningfully brighter partway up the range rather than only near the
   * top — and it saturates at exactly 1 right at the overload threshold,
   * which is what makes a bulb glow hardest just before it fails.
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
 * The voltage a bulb is built to withstand. Safe power is then Vref² / R, so
 * — pleasantly — the overload condition `power > safePower` reduces to
 * exactly `voltageAcrossBulb > REFERENCE_SAFE_VOLTAGE`, independent of R. A
 * bulb of any resistance fails once more than this is pushed across it.
 */
export const REFERENCE_SAFE_VOLTAGE = 12;

export function safePowerFor(resistance: number): number {
  return (REFERENCE_SAFE_VOLTAGE * REFERENCE_SAFE_VOLTAGE) / resistance;
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
    const safePower = safePowerFor(bulb.resistance);
    const overloaded = !burnedOut && power > safePower;
    const brightness = burnedOut || safePower <= 0 ? 0 : clamp01(Math.sqrt(power / safePower));

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
