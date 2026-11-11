/**
 * Light at a flat boundary between two materials: reflection and refraction.
 *
 * Pure functions only — no UI, no React — so every number on the Light page
 * can be unit-tested. Angles are in DEGREES at the edges of this module (that
 * is what the reader types and sees) and measured from the NORMAL, the line
 * perpendicular to the surface, never from the surface itself.
 *
 * ---------------------------------------------------------------- physics --
 *
 *   Law of reflection     θ_r = θ₁
 *   Snell's law           n₁·sin θ₁ = n₂·sin θ₂
 *   Critical angle        θ_c = asin(n₂ / n₁), only when n₁ > n₂
 *   Speed in a medium     v = c / n
 *   Wavelength            λ = λ₀ / n   (the frequency f = c / λ₀ is unchanged)
 *
 * At or beyond the critical angle Snell's law would need sin θ₂ ≥ 1, which no
 * angle satisfies: there is no refracted ray and all of the light reflects
 * (total internal reflection). At exactly θ_c the "refracted" ray would skim
 * along the surface at 90° carrying nothing, so it is treated as total
 * internal reflection too.
 *
 * Simplifications (stated on the page at Pro level): one index per material,
 * a typical value for visible light — real materials vary slightly with
 * colour (dispersion) — and the reflected ray is an illustration, not drawn
 * with its true brightness (no Fresnel calculation).
 */

/** Speed of light in vacuum, m/s (exact by definition of the metre). */
export const SPEED_OF_LIGHT = 299_792_458;

/**
 * Vacuum wavelength used for the wavelength readout: green light, near the
 * middle of the visible range and where the eye is most sensitive.
 */
export const REFERENCE_WAVELENGTH_NM = 550;

export type MediumId = 'air' | 'water' | 'glass' | 'diamond' | 'custom';

export const MEDIUM_ORDER: MediumId[] = ['air', 'water', 'glass', 'diamond', 'custom'];

/**
 * Typical refractive indices for visible light. Air is 1.0003 in reality;
 * 1.00 is the conventional classroom value and keeps the hand-checked
 * critical angles (water 48.75°, glass 41.14°, diamond 24.41°) exact.
 */
export const MEDIUM_INDEX: Record<Exclude<MediumId, 'custom'>, number> = {
  air: 1.0,
  water: 1.33,
  glass: 1.52,
  diamond: 2.42,
};

export const LIGHT_LIMITS = {
  /** Incident angle, degrees from the normal. 90° would be a ray along the surface. */
  angleMin: 0,
  angleMax: 89,
  /** A custom material's refractive index. Nothing ordinary is below 1. */
  indexMin: 1,
  indexMax: 3,
} as const;

/** Within this many degrees of the critical angle the page calls it "nearly". */
export const NEAR_CRITICAL_DEG = 3;

const DEG = Math.PI / 180;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Bring any input into the legal range, so no NaN or Infinity can be
 * produced however a value reached this module. A non-finite number falls
 * back to the bottom of its range.
 */
export function safeAngle(deg: number): number {
  return Number.isFinite(deg) ? clamp(deg, LIGHT_LIMITS.angleMin, LIGHT_LIMITS.angleMax) : 0;
}

export function safeIndex(n: number): number {
  return Number.isFinite(n) ? clamp(n, LIGHT_LIMITS.indexMin, LIGHT_LIMITS.indexMax) : 1;
}

/** The refractive index of a material, using `custom` for the Custom one. */
export function indexOf(medium: MediumId, custom: number): number {
  return medium === 'custom' ? safeIndex(custom) : MEDIUM_INDEX[medium];
}

/**
 * Critical angle in degrees, or null when there is none (n₁ ≤ n₂: light
 * entering an equal or denser material can always get through).
 */
export function criticalAngle(n1: number, n2: number): number | null {
  const a = safeIndex(n1);
  const b = safeIndex(n2);
  if (a <= b) return null;
  return Math.asin(b / a) / DEG;
}

/**
 * Refracted angle in degrees from Snell's law, or null for total internal
 * reflection.
 */
export function refractedAngle(n1: number, n2: number, incidentDeg: number): number | null {
  const a = safeIndex(n1);
  const b = safeIndex(n2);
  const theta1 = safeAngle(incidentDeg);
  if (a === b) return theta1; // same material: no bending at all

  const critical = criticalAngle(a, b);
  if (critical !== null && theta1 >= critical) return null;

  const s = (a / b) * Math.sin(theta1 * DEG);
  // s < 1 is guaranteed below the critical angle; the clamp only absorbs
  // rounding in the last digit right next to it.
  return Math.asin(clamp(s, 0, 1)) / DEG;
}

/** Law of reflection: the angle out equals the angle in. */
export function reflectedAngle(incidentDeg: number): number {
  return safeAngle(incidentDeg);
}

/** Speed of light in a material, m/s. */
export function speedIn(n: number): number {
  return SPEED_OF_LIGHT / safeIndex(n);
}

/** Wavelength in a material for light of vacuum wavelength `vacuumNm`, nm. */
export function wavelengthIn(n: number, vacuumNm = REFERENCE_WAVELENGTH_NM): number {
  return vacuumNm / safeIndex(n);
}

/** Frequency of light with vacuum wavelength `vacuumNm`, Hz. Same in every material. */
export function frequencyOf(vacuumNm = REFERENCE_WAVELENGTH_NM): number {
  return SPEED_OF_LIGHT / (vacuumNm * 1e-9);
}

/**
 * What the light is doing, for the plain-words line:
 *   straight   — it hits head-on (0°), so it goes straight through
 *   same       — both sides are the same material, so nothing bends
 *   toward     — into a denser material: bends toward the normal
 *   away       — into a less dense material: bends away from the normal
 *   nearlyTir  — bending away, and within a few degrees of the critical angle
 *   tir        — total internal reflection: nothing gets through
 */
export type LightBehaviour = 'straight' | 'same' | 'toward' | 'away' | 'nearlyTir' | 'tir';

export interface BoundaryResult {
  n1: number;
  n2: number;
  incident: number;
  reflected: number;
  /** Null under total internal reflection. */
  refracted: number | null;
  /** Null when n₁ ≤ n₂. */
  critical: number | null;
  tir: boolean;
  behaviour: LightBehaviour;
  /** Speed of light on each side, m/s. */
  v1: number;
  v2: number;
  /** Wavelength on each side for the reference colour, nm. */
  lambda1: number;
  lambda2: number;
  /** Frequency of the reference colour, Hz — identical on both sides. */
  frequency: number;
}

/** Everything the page shows, worked out once. Every field is finite or null. */
export function solveBoundary(n1In: number, n2In: number, incidentIn: number): BoundaryResult {
  const n1 = safeIndex(n1In);
  const n2 = safeIndex(n2In);
  const incident = safeAngle(incidentIn);
  const critical = criticalAngle(n1, n2);
  const refracted = refractedAngle(n1, n2, incident);
  const tir = refracted === null;

  let behaviour: LightBehaviour;
  if (tir) behaviour = 'tir';
  else if (n1 === n2) behaviour = 'same';
  else if (incident === 0) behaviour = 'straight';
  else if (n2 > n1) behaviour = 'toward';
  else if (critical !== null && critical - incident <= NEAR_CRITICAL_DEG) behaviour = 'nearlyTir';
  else behaviour = 'away';

  return {
    n1,
    n2,
    incident,
    reflected: reflectedAngle(incident),
    refracted,
    critical,
    tir,
    behaviour,
    v1: speedIn(n1),
    v2: speedIn(n2),
    lambda1: wavelengthIn(n1),
    lambda2: wavelengthIn(n2),
    frequency: frequencyOf(),
  };
}
