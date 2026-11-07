/**
 * Sine waves in one uniform medium, and how two of them add up.
 *
 *     v = f·λ                                 the wave relation
 *     T = 1 / f                               the period
 *     y(x, t) = A·sin(2π(x/λ − f·t))          a wave moving towards +x
 *     y = y₁ + y₂                             superposition
 *     f_beat = |f₁ − f₂|                      beats between two close frequencies
 *
 * The ideal case and nothing more: no damping, no reflection, one medium.
 *
 * Pure functions with no UI or audio code. This module says what the gain of a
 * wave should be and how far to slow its picture down; `useWaveSound` and
 * `WaveScene` are the only places that act on those numbers.
 *
 * ----------------------------------------------------------- material speeds --
 *
 * Longitudinal speed of sound, rounded the way textbooks quote it:
 *
 *   Air    343 m/s at 20 °C. OpenStax University Physics Vol. 1, §17.3; also
 *          √(γRT/M) = 343.2 m/s (Wikipedia, "Speed of sound").
 *   Water  1480 m/s, fresh water near 20 °C. OpenStax lists 1480; Wikipedia
 *          gives 1481 at 20 °C.
 *   Steel  5960 m/s, a longitudinal wave in bulk mild steel. OpenStax University
 *          Physics Vol. 1, §17.3, table of speeds of sound.
 */

export type MaterialId = 'air' | 'water' | 'steel';

export interface Material {
  /** Also the translation key: `waves.materials.<id>`. */
  id: MaterialId;
  /** Speed of sound, m/s. */
  speed: number;
}

export const MATERIAL_ORDER: MaterialId[] = ['air', 'water', 'steel'];

export const MATERIALS: Record<MaterialId, Material> = {
  air: { id: 'air', speed: 343 },
  water: { id: 'water', speed: 1480 },
  steel: { id: 'steel', speed: 5960 },
};

/** Input bounds, kept here so the UI and the physics agree on what is legal. */
export const WAVE_LIMITS = {
  /** The bottom of human hearing. */
  frequencyMin: 20,
  /** Well below the top of human hearing, so nothing is painfully shrill. */
  frequencyMax: 4000,
  /** Relative scale, not a physical unit. */
  amplitudeMin: 1,
  amplitudeMax: 100,
} as const;

// ------------------------------------------------------------- the wave itself

/** λ = v / f, in metres. A wave that never oscillates has no finite wavelength. */
export function wavelength(speed: number, frequency: number): number {
  return frequency > 0 ? speed / frequency : Number.POSITIVE_INFINITY;
}

/** T = 1 / f, in seconds. */
export function period(frequency: number): number {
  return frequency > 0 ? 1 / frequency : Number.POSITIVE_INFINITY;
}

/** Displacement at a point, for a phase given in whole cycles. */
export function displacementAtPhase(
  x: number,
  amplitude: number,
  lambda: number,
  phaseCycles: number
): number {
  return amplitude * Math.sin(2 * Math.PI * (x / lambda - phaseCycles));
}

/** y(x, t) = A·sin(2π(x/λ − f·t)). */
export function displacement(
  x: number,
  t: number,
  wave: { amplitude: number; frequency: number; lambda: number }
): number {
  return displacementAtPhase(x, wave.amplitude, wave.lambda, wave.frequency * t);
}

/** y = y₁ + y₂. Waves in a linear medium simply add. */
export function superpose(y1: number, y2: number): number {
  return y1 + y2;
}

// ---------------------------------------------------------------------- beats

/** f_beat = |f₁ − f₂|, in beats per second. */
export function beatFrequency(f1: number, f2: number): number {
  return Math.abs(f1 - f2);
}

/**
 * How tall the combined wave is at time t: the slowly changing outline of the
 * two added together.
 *
 *     E(t) = √(A₁² + A₂² + 2·A₁·A₂·cos(2π·f_beat·t))
 *
 * It swings between A₁ + A₂ and |A₁ − A₂|, which is the wobble you hear.
 */
export function beatEnvelope(a1: number, a2: number, fBeat: number, t: number): number {
  const squared = a1 * a1 + a2 * a2 + 2 * a1 * a2 * Math.cos(2 * Math.PI * fBeat * t);
  return Math.sqrt(Math.max(0, squared));
}

// ---------------------------------------------------------------------- sound

/**
 * Gain of one wave at full amplitude.
 *
 * Two waves at full amplitude peak at twice this, 0.24, about 12 dB below the
 * loudest the audio output can go: clearly audible, never a blast.
 */
export const MAX_WAVE_GAIN = 0.12;

/** Amplitude maps straight onto gain, because gain is an amplitude. */
export function gainForAmplitude(amplitude: number): number {
  if (!Number.isFinite(amplitude)) return 0;
  const clamped = Math.min(WAVE_LIMITS.amplitudeMax, Math.max(0, amplitude));
  return (clamped / WAVE_LIMITS.amplitudeMax) * MAX_WAVE_GAIN;
}

export interface WaveTone {
  frequency: number;
  amplitude: number;
}

export interface AudioMix {
  f1: number;
  g1: number;
  f2: number;
  g2: number;
}

/**
 * What the two oscillators should play.
 *
 * Two real oscillators at an identical frequency keep whatever phase difference
 * they happen to have, so they could cancel into silence while the picture shows
 * them in step. At an exact match, one oscillator therefore plays the sum, which
 * is what two waves in step add up to.
 */
export function audioMix(first: WaveTone, second: WaveTone | null): AudioMix {
  const g1 = gainForAmplitude(first.amplitude);
  if (!second) return { f1: first.frequency, g1, f2: first.frequency, g2: 0 };

  const g2 = gainForAmplitude(second.amplitude);
  if (second.frequency === first.frequency) {
    return { f1: first.frequency, g1: g1 + g2, f2: second.frequency, g2: 0 };
  }
  return { f1: first.frequency, g1, f2: second.frequency, g2 };
}

// -------------------------------------------------------------------- picture

/**
 * How many times a second the drawn wave wiggles at a given real frequency.
 *
 * A compressed curve rather than one fixed slowdown: at any single slowdown
 * 20 Hz would barely move or 4000 Hz would be a blur. It still rises steadily,
 * so more wiggles in the sound always means more wiggles on the screen.
 */
export function displayRate(frequency: number): number {
  if (frequency <= 0) return 0;
  return 0.35 * Math.pow(frequency / WAVE_LIMITS.frequencyMin, 0.38);
}

/** Seconds of wave time per second of real time. Far below 1: this is the slow motion. */
export function timeScale(frequency: number): number {
  return frequency > 0 ? displayRate(frequency) / frequency : 0;
}

/** "Slowed down about N times", rounded to two significant figures for reading. */
export function slowdownFactor(frequency: number): number {
  const scale = timeScale(frequency);
  if (scale <= 0) return 1;
  const raw = 1 / scale;
  const unit = Math.pow(10, Math.floor(Math.log10(raw)) - 1);
  return Math.round(raw / unit) * unit;
}

/** The smallest of 1, 2 or 5 × a power of ten that is at least `value`. */
export function niceCeil(value: number): number {
  const decade = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 5, 10]) {
    if (step * decade >= value * (1 - 1e-9)) return step * decade;
  }
  return 10 * decade;
}

/** The largest of 1, 2 or 5 × a power of ten that is at most `value`. */
export function niceFloor(value: number): number {
  const decade = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [5, 2, 1]) {
    if (step * decade <= value * (1 + 1e-9)) return step * decade;
  }
  return decade;
}

/** Whole wavelengths of sound in air that the view holds at the very least. */
const AIR_CYCLES = 6;
/** Room left around one full wave, or one full beat, when the view is fitted to it. */
const FIT_MARGIN = 1.1;

export interface ViewInput {
  speed: number;
  f1: number;
  /** Null when there is no second wave. */
  f2: number | null;
  /** The most wavelengths that can be drawn and still be told apart. */
  maxCycles: number;
}

/**
 * How many metres the view spans.
 *
 * The real wavelengths run from 8.6 cm to 298 m, so no one view can hold them
 * all. The span therefore moves in visible 1-2-5 steps, with a ruler on screen,
 * and within a step everything is at true scale:
 *
 *   - It starts from the frequency alone, using air. Going from air to water
 *     keeps the same view, so the wave visibly stretches, and raising the
 *     frequency squeezes the wave until the next step.
 *   - Steel's wave is too long for that view, so it zooms out just enough to
 *     keep one full wave on screen.
 *   - With two waves it zooms out to hold one full beat, unless that would
 *     pack the waves too tightly to tell apart.
 */
export function viewWidth({ speed, f1, f2, maxCycles }: ViewInput): number {
  const base = niceCeil((AIR_CYCLES * MATERIALS.air.speed) / f1);
  const fitted = Math.max(base, niceCeil(FIT_MARGIN * wavelength(speed, f1)));
  if (f2 === null) return fitted;

  const fBeat = beatFrequency(f1, f2);
  if (fBeat === 0) return fitted;

  const forBeat = niceCeil(FIT_MARGIN * wavelength(speed, fBeat));
  if (forBeat <= fitted) return fitted;

  const densest = maxCycles * wavelength(speed, Math.max(f1, f2));
  return Math.max(fitted, Math.min(forBeat, niceFloor(densest)));
}

// ---------------------------------------------------------------------- words

export type PitchBand = 'low' | 'middle' | 'high';
export type LoudnessBand = 'quiet' | 'medium' | 'loud';
export type BeatBand = 'none' | 'wobble' | 'flutter' | 'separate';

export function pitchBand(frequency: number): PitchBand {
  if (frequency < 250) return 'low';
  return frequency < 1000 ? 'middle' : 'high';
}

export function loudnessBand(amplitude: number): LoudnessBand {
  if (amplitude < 34) return 'quiet';
  return amplitude < 67 ? 'medium' : 'loud';
}

/**
 * What a frequency difference sounds like. A slow beat is a clear wobble, a
 * faster one a rough flutter, and past about 30 Hz the ear starts to hear two
 * separate notes instead.
 */
export function beatBand(fBeat: number): BeatBand {
  if (fBeat === 0) return 'none';
  if (fBeat <= 12) return 'wobble';
  return fBeat <= 30 ? 'flutter' : 'separate';
}

/** Small speakers and phones struggle to play tones below about this. */
export const SMALL_SPEAKER_LIMIT = 100;
