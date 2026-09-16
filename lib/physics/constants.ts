/**
 * Physical constants and environment definitions.
 *
 * SI units throughout:
 *   length   metres (m)
 *   mass     kilograms (kg)
 *   time     seconds (s)
 *   velocity m/s
 *   accel    m/s^2
 *   density  kg/m^3
 *   force    newtons (N)
 *
 * Coordinate convention used by the whole physics layer:
 *   +y is UP, y = 0 is ground level.
 *   +x is horizontal, to the right. The object always starts at x = 0.
 *   Gravity therefore contributes acceleration (0, -g).
 */

export type EnvironmentId = 'earth' | 'moon' | 'mars' | 'zerog';

export interface Environment {
  /**
   * Also the translation key: the display name and the note under the picker
   * live at `environments.<id>.label` / `.note` in /locales.
   */
  id: EnvironmentId;
  /** Surface gravitational acceleration, m/s^2 (magnitude; always acts in -y). */
  gravity: number;
  /**
   * Atmospheric density at the surface, kg/m^3.
   *
   * A value of 0 means vacuum: the drag force is identically zero no matter
   * what the user's "air resistance" toggle says. That is why the Moon
   * reproduces Apollo 15's hammer-and-feather result for free.
   */
  airDensity: number;
  /**
   * Whether there is a solid surface to land on. Zero-G is modelled as a
   * drifting chamber: nothing to hit but the walls of the viewport.
   */
  hasGround: boolean;
}

export const ENVIRONMENTS: Record<EnvironmentId, Environment> = {
  earth: {
    id: 'earth',
    gravity: 9.81,
    // Dry air at 15 degC, sea level.
    airDensity: 1.225,
    hasGround: true,
  },
  moon: {
    id: 'moon',
    gravity: 1.62,
    // Hard vacuum for all practical purposes (~10^-12 kg/m^3).
    airDensity: 0,
    hasGround: true,
  },
  mars: {
    id: 'mars',
    gravity: 3.71,
    // Thin CO2 atmosphere, roughly 1/60th of Earth's density.
    airDensity: 0.02,
    hasGround: true,
  },
  zerog: {
    id: 'zerog',
    gravity: 0,
    airDensity: 0,
    hasGround: false,
  },
};

export const ENVIRONMENT_ORDER: EnvironmentId[] = ['earth', 'moon', 'mars', 'zerog'];

/** Slider bounds, kept here so the UI and the physics agree on what is legal. */
export const LIMITS = {
  /**
   * The lower bound sits well under the spec's 0.01 kg because a real feather
   * weighs 0.8 g, and faking its mass would break the drag maths that makes it
   * float. The bound must stay below every preset's mass, since it is now
   * printed next to the input and enforced on what the user types.
   */
  massMin: 0.0005,
  massMax: 50,
  heightMin: 0.5,
  heightMax: 100,
  velocityMin: 0,
  velocityMax: 50,
  angleMin: 0,
  angleMax: 90,

  voltageMin: 1,
  voltageMax: 24,
  resistanceMin: 1,
  resistanceMax: 100,

  magnetDistanceMin: 1,
  magnetDistanceMax: 50,
  magnetStrengthMin: 1,
  magnetStrengthMax: 100,
} as const;

/** Hard stop so a feather drifting down 100 m of Martian air cannot hang the loop. */
export const MAX_SIM_TIME = 120; // seconds

/**
 * Fixed integration timestep. The frame loop accumulates real elapsed time and
 * consumes it in chunks of exactly this size, so the trajectory is identical
 * regardless of the device's frame rate.
 */
export const FIXED_DT = 1 / 240; // seconds
