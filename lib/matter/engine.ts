/**
 * The particles inside the container.
 *
 * This is purely the picture of the thermodynamics in `lib/physics/thermo`:
 * it is handed the substance's phase, how far through a phase change it is,
 * and its temperature, and it moves a few dozen particles accordingly. It
 * decides nothing about the physics, and it has no DOM or React in it, so it
 * can be stepped from a test as easily as from a canvas.
 *
 * Every particle is, at any moment, in one of three modes:
 *
 *   lattice   held to a home site in a regular grid by a spring, vibrating
 *   liquid    free, pulled down by gravity, loosely clinging to its neighbours
 *   gas       free, no gravity to speak of, bouncing off the walls
 *
 * Which mode a particle is in follows the state: below the melting point all
 * are lattice; while melting, the particles whose `meltRank` is below the
 * melted fraction have let go; while boiling, those whose `boilRank` is below
 * the vaporised fraction have left the liquid. Running the same rule with the
 * fraction falling gives freezing and condensing for free.
 *
 * The change of mode is never an instant swap. A spring's strength and the
 * pull of gravity are eased in and out, so a particle leaving its site simply
 * stops being held and starts moving, from where it is.
 */

import { toKelvin, type PhaseId, type Substance } from '../physics/thermo';

export type ParticleMode = 'lattice' | 'liquid' | 'gas';

export const COLS = 10;
export const ROWS = 6;
export const PARTICLE_COUNT = COLS * ROWS;

export interface EngineInput {
  phase: PhaseId;
  /** 0..1 progress through melting or boiling. */
  fraction: number;
  /** °C */
  temperature: number;
  /** Watts; the sign says whether it is heating or cooling. */
  heatRate: number;
  /** Whether heat is currently being applied. */
  running: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  row: number;
  col: number;
  /** Lower ranks let go of the lattice first. */
  meltRank: number;
  /** Lower ranks leave the liquid first. */
  boilRank: number;
  /** 0..1, how firmly held to its lattice site. */
  lock: number;
  /** 0..1, how gas-like. */
  gas: number;
  mode: ParticleMode;
}

export interface Sparkle {
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
}

export interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  wobble: number;
  seed: number;
}

export interface Wisp {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** How the temperature changes the agitation: speed goes as sqrt(T), scaled to the substance. */
export function agitation(sub: Substance, temperature: number): number {
  const ratio = toKelvin(temperature) / toKelvin(sub.boilingPoint);
  return clamp(Math.sqrt(Math.max(ratio, 0)), 0.3, 1.7);
}

export class MatterEngine {
  particles: Particle[] = [];
  sparkles: Sparkle[] = [];
  bubbles: Bubble[] = [];
  wisps: Wisp[] = [];

  bounds: Bounds = { left: 0, top: 0, right: 100, bottom: 100 };
  spacing = 14;
  radius = 5;
  /** Smoothed y of the liquid's top surface, or the floor when there is no pool. */
  surfaceY = 100;
  /** 0..1, how much liquid there is to draw. */
  poolAmount = 0;

  private readonly rand: () => number;
  private width = 0;
  private height = 0;

  constructor(seed = 7) {
    this.rand = mulberry32(seed);
    this.buildParticles();
  }

  private buildParticles() {
    const keys: { index: number; key: number }[] = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        // Top rows melt first: a low rank lets go early.
        const heightFromBottom = row === ROWS - 1 ? 0 : (ROWS - 1 - row) / (ROWS - 1);
        const index = row * COLS + col;
        keys.push({ index, key: this.rand() * 0.5 + (1 - heightFromBottom) * 0.5 });
        this.particles.push({
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          homeX: 0,
          homeY: 0,
          row,
          col,
          meltRank: 0,
          boilRank: this.rand(),
          lock: 1,
          gas: 0,
          mode: 'lattice',
        });
      }
    }
    // Ranks spread evenly over 0..1 whatever the random keys were.
    keys.sort((a, b) => a.key - b.key);
    keys.forEach((k, order) => {
      this.particles[k.index].meltRank = order / (PARTICLE_COUNT - 1);
    });
    // Same for boiling, so the vaporised share tracks the fraction closely.
    const boil = this.particles.map((p, i) => ({ i, r: p.boilRank })).sort((a, b) => a.r - b.r);
    boil.forEach((b, order) => {
      this.particles[b.i].boilRank = order / (PARTICLE_COUNT - 1);
    });
  }

  /** Lay the container out for a canvas of this size. Existing motion is carried over proportionally. */
  resize(width: number, height: number) {
    if (width < 10 || height < 10) return;
    const old = this.bounds;
    const oldW = old.right - old.left;
    const oldH = old.bottom - old.top;
    const hadLayout = this.width > 0;

    this.width = width;
    this.height = height;
    // Room under the box for the heat source.
    this.bounds = { left: 14, top: 14, right: width - 14, bottom: height - 26 };
    const iw = this.bounds.right - this.bounds.left;
    const ih = this.bounds.bottom - this.bounds.top;

    this.spacing = clamp(Math.min((iw * 0.8) / (COLS - 1), (ih * 0.52) / (ROWS - 1)), 8, 26);
    this.radius = this.spacing * 0.38;

    const x0 = (this.bounds.left + this.bounds.right) / 2 - ((COLS - 1) * this.spacing) / 2;
    const yBottom = this.bounds.bottom - this.radius - 2;
    for (const p of this.particles) {
      p.homeX = x0 + p.col * this.spacing;
      p.homeY = yBottom - (ROWS - 1 - p.row) * this.spacing;
      if (hadLayout && oldW > 0 && oldH > 0) {
        p.x = this.bounds.left + ((p.x - old.left) / oldW) * iw;
        p.y = this.bounds.top + ((p.y - old.top) / oldH) * ih;
      } else {
        p.x = p.homeX;
        p.y = p.homeY;
      }
    }
    if (!hadLayout) this.surfaceY = this.bounds.bottom;
  }

  /** The mode a particle should be heading for in this state. */
  modeFor(p: Particle, input: EngineInput): ParticleMode {
    switch (input.phase) {
      case 'solid':
        return 'lattice';
      case 'melting':
        return p.meltRank >= input.fraction ? 'lattice' : 'liquid';
      case 'liquid':
        return 'liquid';
      case 'boiling':
        return p.boilRank >= input.fraction ? 'liquid' : 'gas';
      default:
        return 'gas';
    }
  }

  /** Put every particle where this state says it belongs, with no transition. */
  settle(input: EngineInput) {
    this.sparkles = [];
    this.bubbles = [];
    this.wisps = [];
    const { left, right, top, bottom } = this.bounds;
    const r = this.radius;
    for (const p of this.particles) {
      p.mode = this.modeFor(p, input);
      p.lock = p.mode === 'lattice' ? 1 : 0;
      p.gas = p.mode === 'gas' ? 1 : 0;
      p.vx = 0;
      p.vy = 0;
      if (p.mode === 'lattice') {
        p.x = p.homeX;
        p.y = p.homeY;
      } else if (p.mode === 'liquid') {
        p.x = left + r + this.rand() * (right - left - 2 * r);
        p.y = bottom - r - this.rand() * (ROWS * this.spacing * 0.9);
      } else {
        p.x = left + r + this.rand() * (right - left - 2 * r);
        p.y = top + r + this.rand() * (bottom - top - 2 * r);
      }
    }
    this.surfaceY = bottom;
    this.poolAmount = 0;
  }

  step(rawDt: number, input: EngineInput, sub: Substance) {
    const dt = clamp(rawDt, 0, 1 / 20);
    if (dt === 0 || this.width === 0) return;

    const sub2 = 2;
    const h = dt / sub2;
    const s = this.spacing;
    const r = this.radius;
    const agit = agitation(sub, input.temperature);
    const { left, right, top, bottom } = this.bounds;
    const cooling = input.heatRate < 0;

    // ---- decide each particle's mode and ease its lock / gas weights -------
    for (const p of this.particles) {
      const next = this.modeFor(p, input);
      if (next !== p.mode) {
        // Freezing: a particle that has just locked on flashes as it crystallises.
        if (next === 'lattice' && cooling && this.sparkles.length < 60) {
          this.sparkles.push({ x: p.x, y: p.y, age: 0, life: 0.55, size: s * (0.5 + this.rand() * 0.4) });
        }
        p.mode = next;
      }
      p.lock += ((p.mode === 'lattice' ? 1 : 0) - p.lock) * ease(5, dt);
      p.gas += ((p.mode === 'gas' ? 1 : 0) - p.gas) * ease(3, dt);
    }

    // Liquids level out: where the pool is crowded, the pressure pushes it
    // sideways. A small outward push from the pool's centre does the same job.
    let poolX = 0;
    let poolN = 0;
    for (const p of this.particles) {
      if (p.mode === 'liquid' && p.lock < 0.5 && p.gas < 0.5) {
        poolX += p.x;
        poolN++;
      }
    }
    const poolCentre = poolN > 0 ? poolX / poolN : (left + right) / 2;
    const halfWidth = Math.max((right - left) / 2, 1);

    for (let step = 0; step < sub2; step++) {
      // ---- pairwise forces (free particles only; lattice sites hold their own)
      const n = this.particles.length;
      const d0 = 2.7 * r;
      const dCoh = 4.2 * r;
      for (let i = 0; i < n; i++) {
        const a = this.particles[i];
        const freeA = 1 - a.lock;
        for (let j = i + 1; j < n; j++) {
          const b = this.particles[j];
          const freeB = 1 - b.lock;
          if (freeA < 0.02 && freeB < 0.02) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > dCoh * dCoh || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const ux = dx / d;
          const uy = dy / d;
          let f = 0;
          if (d < d0) {
            f = -9000 * (1 - d / d0); // push apart
          } else {
            // Liquids cling; gas barely does.
            const cling = (1 - a.gas) * (1 - b.gas);
            f = 70 * cling * (1 - (d - d0) / (dCoh - d0));
          }
          a.vx += ux * f * h * freeA;
          a.vy += uy * f * h * freeA;
          b.vx -= ux * f * h * freeB;
          b.vy -= uy * f * h * freeB;
        }
      }

      // ---- per-particle forces and integration -----------------------------
      for (const p of this.particles) {
        const free = 1 - p.lock;
        let ax = 0;
        let ay = 0;

        if (p.lock > 0.001) {
          const k = 120 * p.lock;
          ax -= k * (p.x - p.homeX);
          ay -= k * (p.y - p.homeY);
          const damp = Math.exp(-h * 5 * p.lock);
          p.vx *= damp;
          p.vy *= damp;
        }

        // Thermal kicks: gentle in the lattice (more as it nears melting), livelier when free.
        const kick = (110 + 260 * agit * agit) * p.lock + 380 * free;
        ax += (this.rand() - 0.5) * 2 * kick;
        ay += (this.rand() - 0.5) * 2 * kick;

        // Gravity pulls liquids to the floor; a gas hardly notices it.
        ay += free * (620 * (1 - p.gas) + 14 * p.gas);
        // ...and the pool spreads out along it.
        if (p.mode === 'liquid') ax += free * (1 - p.gas) * 90 * ((p.x - poolCentre) / halfWidth);

        p.vx += ax * h;
        p.vy += ay * h;

        // Thermostat: free particles drift toward the speed their temperature implies.
        if (free > 0.02) {
          const target = (4.6 * (1 - p.gas) + 17 * p.gas) * s * agit;
          const speed = Math.hypot(p.vx, p.vy);
          if (speed < 1e-3) {
            const ang = this.rand() * Math.PI * 2;
            p.vx = Math.cos(ang) * target;
            p.vy = Math.sin(ang) * target;
          } else {
            const k = free * ease(p.gas > 0.5 ? 2.4 : 1.4, h);
            const scale = 1 + ((target - speed) / speed) * k;
            p.vx *= scale;
            p.vy *= scale;
          }
        }

        const vMax = 26 * s;
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > vMax) {
          p.vx *= vMax / speed;
          p.vy *= vMax / speed;
        }

        p.x += p.vx * h;
        p.y += p.vy * h;

        // Walls. A gas bounces back almost unchanged; a liquid loses most of it.
        const e = 0.3 + 0.68 * p.gas;
        if (p.x < left + r) {
          p.x = left + r;
          p.vx = Math.abs(p.vx) * e;
        } else if (p.x > right - r) {
          p.x = right - r;
          p.vx = -Math.abs(p.vx) * e;
        }
        if (p.y < top + r) {
          p.y = top + r;
          p.vy = Math.abs(p.vy) * e;
        } else if (p.y > bottom - r) {
          p.y = bottom - r;
          p.vy = -Math.abs(p.vy) * e;
        }
      }
    }

    this.updateSurface(dt);
    this.updateEffects(dt, input);
  }

  private updateSurface(dt: number) {
    const ys: number[] = [];
    for (const p of this.particles) {
      if (p.lock < 0.5 && p.gas < 0.5) ys.push(p.y);
    }
    const { bottom } = this.bounds;
    let target = bottom + 6;
    if (ys.length >= 3) {
      ys.sort((a, b) => a - b);
      target = ys[Math.floor(ys.length * 0.2)] - this.radius * 0.6;
    }
    this.surfaceY += (target - this.surfaceY) * ease(6, dt);
    const amount = clamp(ys.length / PARTICLE_COUNT, 0, 1);
    this.poolAmount += (amount - this.poolAmount) * ease(5, dt);
  }

  private updateEffects(dt: number, input: EngineInput) {
    const { left, right, top, bottom } = this.bounds;
    const s = this.spacing;
    const r = this.radius;
    const boiling = input.phase === 'boiling';
    const freezing = input.phase === 'melting' && input.heatRate < 0 && input.running;

    // ---- bubbles rise through the liquid while it boils ---------------------
    if (boiling && input.running && this.poolAmount > 0.1) {
      const activity = input.heatRate >= 0 ? 1 : 0.3;
      const rate = 16 * activity * (1 - input.fraction * 0.7);
      if (this.bubbles.length < 40 && this.rand() < rate * dt) {
        const half = (COLS - 1) * s * 0.5;
        const cx = (left + right) / 2;
        this.bubbles.push({
          x: cx + (this.rand() * 2 - 1) * half,
          y: bottom - r * 2,
          r: r * (0.35 + this.rand() * 0.45),
          vy: -s * (3 + this.rand() * 3),
          wobble: 1 + this.rand() * 2,
          seed: this.rand() * Math.PI * 2,
        });
      }
    }
    for (const b of this.bubbles) {
      b.y += b.vy * dt;
      b.x += Math.sin(b.seed + b.y * 0.08 * b.wobble) * 8 * dt;
    }
    this.bubbles = this.bubbles.filter((b) => {
      if (b.y <= this.surfaceY + b.r) {
        // Pop at the surface, letting a little vapour go.
        if (boiling && this.wisps.length < 80 && this.rand() < 0.7) {
          this.wisps.push(this.newWisp(b.x, this.surfaceY));
        }
        return false;
      }
      return true;
    });

    // ---- steam above the liquid ---------------------------------------------
    if (boiling && this.poolAmount > 0.05) {
      const rate = (input.running ? 9 : 2) * (0.4 + 0.6 * input.fraction);
      if (this.wisps.length < 80 && this.rand() < rate * dt) {
        const x = left + r + this.rand() * (right - left - 2 * r);
        this.wisps.push(this.newWisp(x, this.surfaceY));
      }
    }
    for (const w of this.wisps) {
      w.age += dt;
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.vx += (this.rand() - 0.5) * 20 * dt;
    }
    this.wisps = this.wisps.filter((w) => w.age < w.life && w.y > top);

    // ---- crystals glint while it freezes -------------------------------------
    if (freezing && this.sparkles.length < 60 && this.rand() < 9 * dt) {
      const locked = this.particles.filter((p) => p.mode === 'lattice');
      if (locked.length > 0) {
        const p = locked[Math.floor(this.rand() * locked.length)];
        this.sparkles.push({ x: p.x, y: p.y, age: 0, life: 0.6, size: s * (0.45 + this.rand() * 0.5) });
      }
    }
    for (const sp of this.sparkles) sp.age += dt;
    this.sparkles = this.sparkles.filter((sp) => sp.age < sp.life);
  }

  private newWisp(x: number, y: number): Wisp {
    const s = this.spacing;
    return {
      x,
      y,
      vx: (this.rand() - 0.5) * 10,
      vy: -s * (1.6 + this.rand() * 1.8),
      age: 0,
      life: 1.4 + this.rand() * 1.2,
      r: this.radius * (0.9 + this.rand() * 0.8),
    };
  }

  /** Mean speed of the particles, px/s — the thing the picture is meant to convey. */
  meanSpeed(): number {
    let sum = 0;
    for (const p of this.particles) sum += Math.hypot(p.vx, p.vy);
    return sum / this.particles.length;
  }

  /** Share of particles in each mode. */
  modeShares(): Record<ParticleMode, number> {
    const counts: Record<ParticleMode, number> = { lattice: 0, liquid: 0, gas: 0 };
    for (const p of this.particles) counts[p.mode]++;
    const n = this.particles.length;
    return { lattice: counts.lattice / n, liquid: counts.liquid / n, gas: counts.gas / n };
  }
}
