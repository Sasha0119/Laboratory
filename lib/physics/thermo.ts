/**
 * Heating and cooling a substance through its phase changes.
 *
 * Standard atmospheric pressure throughout. Pressure effects, phase diagrams
 * and sublimation are deliberately out of scope: the only transitions here are
 * solid <-> liquid <-> gas, driven by heat going in or out.
 *
 * ------------------------------------------------------------------ model --
 *
 * The whole state of the substance is ONE number: its enthalpy `h`, in joules,
 * measured from the moment it is solid at exactly its melting point (h = 0).
 * Heat added is simply `h += Q`. Everything else is a pure function of `h`:
 *
 *   h <= 0                         solid, warming up        T = Tm + h / (m·c_s)
 *   0 <= h <= m·L_f                melting (T stays at Tm)  T = Tm
 *   .. then up by m·c_l·(Tb − Tm)  liquid, warming up       T = Tm + (h − m·L_f) / (m·c_l)
 *   .. then up by m·L_v            boiling (T stays at Tb)  T = Tb
 *   beyond                         gas, warming up          T = Tb + (h − h_gas) / (m·c_g)
 *
 * That is exactly Q = m·c·ΔT inside a phase and Q = m·L across a phase
 * change, so the temperature plateau during melting and boiling is not an
 * animation: the heat going in is being spent on the change itself, and the
 * temperature cannot rise until the latent heat has been paid in full.
 *
 * Because the state is a single energy, there is no integration error and
 * the result does not depend on the size of the time step. Cooling is the
 * same function run backwards, so freezing and condensing are free.
 *
 * ------------------------------------------------------------ simplifications
 *
 * Specific heats are held constant within each phase. Real values drift with
 * temperature; the figures below are the usual handbook values near each
 * phase change, which is the right choice for teaching the shape of the curve.
 *
 * ----------------------------------------------------------- substance data --
 *
 * All SI: specific heat in J/(kg·K), latent heat in J/kg, temperatures in °C.
 *
 *   Water     Tm 0 °C, Tb 100 °C
 *             c_ice 2090, c_water 4186, c_steam 2010
 *             L_f 3.34e5 (334 kJ/kg), L_v 2.26e6 (2260 kJ/kg)
 *   Iron      Tm 1538 °C (1811 K), Tb 2862 °C (3134 K)
 *             c_solid 449 (25 °C), c_liquid 824 (46 J/mol·K / 0.05585 kg/mol),
 *             c_gas 372 (monatomic ideal gas, (5/2)R / M)
 *             L_f 2.47e5 (13.8 kJ/mol), L_v 6.09e6 (340 kJ/mol)
 *   Nitrogen  Tm −210.0 °C (63.15 K), Tb −195.8 °C (77.36 K)
 *             c_solid ~1960 (about 55 J/mol·K near the melting point),
 *             c_liquid 2040, c_gas 1040
 *             L_f 2.57e4 (25.7 kJ/kg), L_v 1.99e5 (199 kJ/kg)
 */

export type PhaseId = 'solid' | 'melting' | 'liquid' | 'boiling' | 'gas';

export interface Substance {
  /** Preset id, or 'custom'. Also the translation key suffix for the name. */
  id: string;
  /** °C */
  meltingPoint: number;
  /** °C */
  boilingPoint: number;
  /** J/(kg·K), in each phase */
  cSolid: number;
  cLiquid: number;
  cGas: number;
  /** Latent heat of fusion, J/kg */
  latentFusion: number;
  /** Latent heat of vaporization, J/kg */
  latentVaporization: number;
}

export type PresetId = 'water' | 'iron' | 'nitrogen';
export type SubstanceId = PresetId | 'custom';

export const PRESET_ORDER: PresetId[] = ['water', 'iron', 'nitrogen'];

export const PRESET_SUBSTANCES: Record<PresetId, Substance> = {
  water: {
    id: 'water',
    meltingPoint: 0,
    boilingPoint: 100,
    cSolid: 2090,
    cLiquid: 4186,
    cGas: 2010,
    latentFusion: 334_000,
    latentVaporization: 2_260_000,
  },
  iron: {
    id: 'iron',
    meltingPoint: 1538,
    boilingPoint: 2862,
    cSolid: 449,
    cLiquid: 824,
    cGas: 372,
    latentFusion: 247_000,
    latentVaporization: 6_090_000,
  },
  nitrogen: {
    id: 'nitrogen',
    meltingPoint: -210,
    boilingPoint: -195.8,
    cSolid: 1960,
    cLiquid: 2040,
    cGas: 1040,
    latentFusion: 25_700,
    latentVaporization: 199_000,
  },
};

/** What each preset starts with, so the first thing a reader sees is a good lesson. */
export const PRESET_DEFAULTS: Record<PresetId, { startTemperature: number; heatRate: number }> = {
  // Ice at −20 °C, 20 kW: a minute or so of simulated time to melt, a few more to boil.
  water: { startTemperature: -20, heatRate: 20_000 },
  iron: { startTemperature: 25, heatRate: 100_000 },
  nitrogen: { startTemperature: -220, heatRate: 2_000 },
};

/** A starting point for the Custom substance (a made-up, round-numbered material). */
export const CUSTOM_DEFAULT: Substance = {
  id: 'custom',
  meltingPoint: 50,
  boilingPoint: 200,
  cSolid: 1000,
  cLiquid: 1500,
  cGas: 800,
  latentFusion: 100_000,
  latentVaporization: 500_000,
};

/** The mass of substance in the container. Fixed, so heat rate alone sets the pace. */
export const SUBSTANCE_MASS = 1; // kg

export const ABSOLUTE_ZERO_C = -273.15;
/** Hard ceiling for the simulation; heating stops here. */
export const MAX_TEMPERATURE_C = 6000;

export const THERMO_LIMITS = {
  startTemperatureMin: -270,
  startTemperatureMax: 5000,
  heatRateMin: -200_000,
  heatRateMax: 200_000,
  pointMin: -270,
  pointMax: 5000,
  specificHeatMin: 100,
  specificHeatMax: 10_000,
  latentHeatMin: 1_000,
  latentHeatMax: 10_000_000,
} as const;

export function isValidSubstance(s: Substance): boolean {
  const finite = [
    s.meltingPoint,
    s.boilingPoint,
    s.cSolid,
    s.cLiquid,
    s.cGas,
    s.latentFusion,
    s.latentVaporization,
  ].every(Number.isFinite);
  return (
    finite &&
    s.meltingPoint > ABSOLUTE_ZERO_C &&
    s.boilingPoint > s.meltingPoint &&
    s.boilingPoint < MAX_TEMPERATURE_C &&
    s.cSolid > 0 &&
    s.cLiquid > 0 &&
    s.cGas > 0 &&
    s.latentFusion > 0 &&
    s.latentVaporization > 0
  );
}

// ------------------------------------------------------------- thresholds --

export interface Thresholds {
  /** Enthalpy at absolute zero (the floor). */
  floor: number;
  /** Start of melting (always 0). */
  meltStart: number;
  meltEnd: number;
  boilStart: number;
  boilEnd: number;
  /** Enthalpy at MAX_TEMPERATURE_C (the ceiling). */
  ceiling: number;
}

export function thresholds(s: Substance, mass: number = SUBSTANCE_MASS): Thresholds {
  const meltEnd = mass * s.latentFusion;
  const boilStart = meltEnd + mass * s.cLiquid * (s.boilingPoint - s.meltingPoint);
  const boilEnd = boilStart + mass * s.latentVaporization;
  return {
    floor: -mass * s.cSolid * (s.meltingPoint - ABSOLUTE_ZERO_C),
    meltStart: 0,
    meltEnd,
    boilStart,
    boilEnd,
    ceiling: boilEnd + mass * s.cGas * (MAX_TEMPERATURE_C - s.boilingPoint),
  };
}

// ------------------------------------------------------------------ state --

export interface ThermoState {
  /** °C */
  temperature: number;
  phase: PhaseId;
  /**
   * How far through a phase change it is, 0..1: the melted share while
   * melting, the vaporised share while boiling. 0 or 1 outside a change
   * (0 for solid, 1 for liquid and gas).
   */
  fraction: number;
}

/** The state of the substance for a given enthalpy. */
export function stateAt(s: Substance, h: number, mass: number = SUBSTANCE_MASS): ThermoState {
  const th = thresholds(s, mass);
  const e = Math.min(Math.max(h, th.floor), th.ceiling);

  if (e <= th.meltStart) {
    return { temperature: s.meltingPoint + e / (mass * s.cSolid), phase: 'solid', fraction: 0 };
  }
  if (e < th.meltEnd) {
    return { temperature: s.meltingPoint, phase: 'melting', fraction: e / th.meltEnd };
  }
  if (e <= th.boilStart) {
    return {
      temperature: s.meltingPoint + (e - th.meltEnd) / (mass * s.cLiquid),
      phase: 'liquid',
      fraction: 1,
    };
  }
  if (e < th.boilEnd) {
    return {
      temperature: s.boilingPoint,
      phase: 'boiling',
      fraction: (e - th.boilStart) / (th.boilEnd - th.boilStart),
    };
  }
  return {
    temperature: s.boilingPoint + (e - th.boilEnd) / (mass * s.cGas),
    phase: 'gas',
    fraction: 1,
  };
}

/**
 * The enthalpy that corresponds to a starting temperature.
 *
 * A temperature on its own does not say which phase the substance is in when
 * it sits exactly on a melting or boiling point, so those two cases are
 * decided here: at the melting point it starts fully SOLID, at the boiling
 * point fully LIQUID. (Nothing is lost: the very next joule starts the change.)
 */
export function enthalpyForTemperature(
  s: Substance,
  temperature: number,
  mass: number = SUBSTANCE_MASS
): number {
  const th = thresholds(s, mass);
  const T = Math.min(Math.max(temperature, ABSOLUTE_ZERO_C), MAX_TEMPERATURE_C);

  if (T <= s.meltingPoint) return mass * s.cSolid * (T - s.meltingPoint);
  if (T <= s.boilingPoint) return th.meltEnd + mass * s.cLiquid * (T - s.meltingPoint);
  return th.boilEnd + mass * s.cGas * (T - s.boilingPoint);
}

/** Adds (or, if negative, removes) heat, stopping at absolute zero and at the ceiling. */
export function addHeat(
  s: Substance,
  h: number,
  heat: number,
  mass: number = SUBSTANCE_MASS
): number {
  const th = thresholds(s, mass);
  return Math.min(Math.max(h + heat, th.floor), th.ceiling);
}

/** True when `h` is pinned at absolute zero or at the temperature ceiling. */
export function atLimit(s: Substance, h: number, mass: number = SUBSTANCE_MASS): 'cold' | 'hot' | null {
  const th = thresholds(s, mass);
  if (h <= th.floor) return 'cold';
  if (h >= th.ceiling) return 'hot';
  return null;
}

// ------------------------------------------------------------ the formulas --

/** Q = m·c·ΔT — heat to change the temperature of a mass within one phase. */
export function heatToWarm(mass: number, specificHeat: number, deltaT: number): number {
  return mass * specificHeat * deltaT;
}

/** Q = m·L — heat to melt (L = latent heat of fusion) or boil (latent heat of vaporization). */
export function heatToChangePhase(mass: number, latentHeat: number): number {
  return mass * latentHeat;
}

/**
 * Total heat to take the substance from one temperature to another, across
 * whatever phase changes lie in between. Equivalent to the difference of the
 * two enthalpies, written out the long way in the tests as a cross-check.
 */
export function heatBetween(
  s: Substance,
  fromTemperature: number,
  toTemperature: number,
  mass: number = SUBSTANCE_MASS
): number {
  return enthalpyForTemperature(s, toTemperature, mass) - enthalpyForTemperature(s, fromTemperature, mass);
}

/** The specific heat in force for a phase, or null while a phase change is under way. */
export function specificHeatFor(s: Substance, phase: PhaseId): number | null {
  switch (phase) {
    case 'solid':
      return s.cSolid;
    case 'liquid':
      return s.cLiquid;
    case 'gas':
      return s.cGas;
    default:
      return null;
  }
}

/** The latent heat in play during a phase change, or null otherwise. */
export function latentHeatFor(s: Substance, phase: PhaseId): number | null {
  if (phase === 'melting') return s.latentFusion;
  if (phase === 'boiling') return s.latentVaporization;
  return null;
}

/** °C to kelvin. */
export function toKelvin(celsius: number): number {
  return celsius - ABSOLUTE_ZERO_C;
}

// ----------------------------------------------------------------- display --

/**
 * The temperature window a thermometer or colour scale should span for this
 * substance: a little beyond the melting point below and the boiling point
 * above, so all three phases have room.
 */
export function temperatureWindow(s: Substance): { low: number; high: number } {
  const span = s.boilingPoint - s.meltingPoint;
  return {
    low: Math.max(ABSOLUTE_ZERO_C, s.meltingPoint - 0.4 * span),
    high: s.boilingPoint + 0.4 * span,
  };
}

/** 0 (cold) .. 1 (hot): where a temperature sits in the substance's own window. */
export function heatLevel(s: Substance, temperature: number): number {
  const { low, high } = temperatureWindow(s);
  return Math.min(1, Math.max(0, (temperature - low) / (high - low)));
}
