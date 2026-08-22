/**
 * Impact feel: how hard a landing looks, sounds and shakes.
 *
 * Everything here is derived from the two numbers the simulation actually
 * produces — impact speed and kinetic energy — rather than being hand-tuned
 * per preset. That keeps the feedback honest: a marble hits fast but light,
 * a book hits slow but heavy, and they feel different for the right reason.
 *
 * Energy spans six orders of magnitude between a feather (0.0003 J) and a
 * football dropped 100 m (420 J), so anything scaled by energy is scaled by
 * its logarithm; linear scaling would make everything except the heaviest
 * impact register as nothing at all.
 */

export interface ImpactProfile {
  /** Peak squash, 0..0.6, as a fraction of the object's height. */
  squash: number;
  /** Screen shake amplitude in pixels. */
  shake: number;
  /** Number of debris particles to spawn. */
  particleCount: number;
  /** Typical particle launch speed, px/s. */
  particleSpeed: number;
  /** Sound level, 0..1. */
  volume: number;
  /** Sample playback rate; doubles as pitch since pitch correction is off. */
  pitch: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function impactProfile(
  speed: number,
  mass: number,
  energy: number
): ImpactProfile {
  // log10(1 + E) maps 0.0003 J -> 0.0001 and 420 J -> 2.6.
  const logE = Math.log10(1 + Math.max(energy, 0));
  const fast = clamp(speed / 25, 0, 1.2);
  // Where this mass sits between the lightest and heaviest allowed object.
  const heavy = clamp(Math.log10(mass / 0.001) / Math.log10(50 / 0.001), 0, 1);

  return {
    squash: clamp(0.1 + 0.42 * fast * (0.55 + 0.45 * heavy), 0, 0.6),
    shake: clamp(logE * 3.2, 0, 11),
    particleCount: Math.round(clamp(3 + logE * 14, 2, 48)),
    particleSpeed: clamp(34 + 30 * logE, 30, 165),
    volume: clamp(0.1 + 0.28 * logE, 0.06, 1),
    pitch: clamp(0.72 + speed / 60, 0.62, 1.9),
  };
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  age: number;
  life: number;
  spin: number;
  rotation: number;
}

/**
 * Spawn a dust burst at a screen position. Particles are simulated in screen
 * space with an arbitrary "looks right" gravity — they are decorative debris,
 * not part of the physics under test.
 */
export function spawnBurst(
  x: number,
  y: number,
  profile: ImpactProfile,
  horizontalBias = 0
): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < profile.particleCount; i++) {
    // Fan out sideways and up, in a shallow cone off the surface.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
    const speed = profile.particleSpeed * (0.35 + Math.random() * 0.9);
    out.push({
      x: x + (Math.random() - 0.5) * 8,
      y,
      vx: Math.cos(angle) * speed + horizontalBias * 0.35,
      vy: Math.sin(angle) * speed * (0.5 + Math.random() * 0.8),
      size: 1 + Math.random() * 2.8,
      age: 0,
      life: 0.35 + Math.random() * 0.6,
      spin: (Math.random() - 0.5) * 8,
      rotation: Math.random() * Math.PI,
    });
  }
  return out;
}

const PARTICLE_GRAVITY = 620; // px/s^2, tuned for the look, not for realism
const PARTICLE_DRAG = 1.6; // per second

/** Advance the debris. Returns only the particles still alive. */
export function stepParticles(particles: Particle[], dt: number, floorY: number): Particle[] {
  const alive: Particle[] = [];
  for (const p of particles) {
    p.age += dt;
    if (p.age >= p.life) continue;
    const damp = Math.max(0, 1 - PARTICLE_DRAG * dt);
    p.vx *= damp;
    p.vy = p.vy * damp + PARTICLE_GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y > floorY) {
      // Settle onto the surface with a little scatter rather than passing through.
      p.y = floorY;
      p.vy *= -0.28;
      p.vx *= 0.6;
    }
    p.rotation += p.spin * dt;
    alive.push(p);
  }
  return alive;
}

/**
 * Damped oscillation used for both the squash rebound and the screen shake:
 * a fast decay multiplied by a ringing cosine, so the object bounces back and
 * overshoots once or twice instead of snapping.
 */
export function ring(age: number, tau: number, hz: number): number {
  if (age < 0) return 0;
  return Math.exp(-age / tau) * Math.cos(2 * Math.PI * hz * age);
}
