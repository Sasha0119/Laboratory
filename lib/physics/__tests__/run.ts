/**
 * Physics unit tests.
 *
 * Run with:  npm run test:physics
 *
 * Deliberately dependency-free (no jest/vitest) so the checks run with plain
 * `tsx` and stay easy to execute while iterating on the equations. Everything
 * under test is a pure function or the UI-free `Simulator`.
 */

import { ENVIRONMENTS, FIXED_DT } from '../constants';
import { buildDragModel, derivative, rk4Step, terminalVelocity } from '../drag';
import {
  apexHeight,
  horizontalRange,
  impactSpeed,
  positionY,
  resolveLaunch,
  timeOfFlight,
  timeToFall,
  velocityY,
} from '../kinematics';
import { PRESETS_BY_ID } from '../presets';
import { simulate, type SimParams } from '../simulation';
import { resolveCollision, simulateCollision } from '../collision';
import { REFERENCE_SAFE_VOLTAGE, resolveCircuit, safePowerFor } from '../circuit';
import {
  computeForce,
  fieldVectorAt,
  forceFraction,
  magnetPoles,
  traceFieldLines,
} from '../magnetism';

// ---------------------------------------------------------------- harness --

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  [32mPASS[0m  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  [31mFAIL[0m  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function near(name: string, actual: number, expected: number, tol: number) {
  const delta = Math.abs(actual - expected);
  check(
    name,
    delta <= tol,
    `expected ${expected.toPrecision(6)}, got ${actual.toPrecision(6)} (Δ ${delta.toExponential(2)}, tol ${tol})`
  );
}

function section(title: string) {
  console.log(`\n[1m${title}[0m`);
}

const EARTH_G = ENVIRONMENTS.earth.gravity;

function params(over: Partial<SimParams> & { presetId?: string } = {}): SimParams {
  const preset = PRESETS_BY_ID[over.presetId ?? 'ball'];
  return {
    mass: preset.mass,
    dragCoefficient: preset.dragCoefficient,
    area: preset.area,
    dropHeight: 10,
    speed: 0,
    angleDeg: 0,
    environmentId: 'earth',
    airResistance: false,
    ...over,
  };
}

// ------------------------------------------------------- closed-form maths --

section('Closed-form kinematics');

near('t = sqrt(2h/g): 20 m on Earth', timeToFall(20, EARTH_G), Math.sqrt(40 / EARTH_G), 1e-12);
near('t = sqrt(2h/g): 1.62 m on the Moon', timeToFall(1.62, 1.62), Math.sqrt(2), 1e-12);
check('zero gravity never lands', timeToFall(10, 0) === Infinity);

near('y(t) = y0 + v0y t - ½gt²', positionY(100, 0, EARTH_G, 2), 100 - 0.5 * EARTH_G * 4, 1e-12);
near('vy(t) = v0y - gt', velocityY(12, EARTH_G, 1.5), 12 - EARTH_G * 1.5, 1e-12);

// A 30 m/s vertical launch peaks at v²/2g = 45.87 m above the release point.
near('apex height, 30 m/s straight up', apexHeight(0, 30, EARTH_G), 900 / (2 * EARTH_G), 1e-12);
// ...and the whole up-and-down trip takes 2v/g.
near('time of flight, 30 m/s straight up', timeOfFlight(0, 30, EARTH_G), 60 / EARTH_G, 1e-12);

// Textbook range for a ground-level launch: R = v² sin(2θ) / g.
const v45 = resolveLaunch(20, 45);
near(
  'range of a 20 m/s, 45° launch',
  horizontalRange(0, v45.x, v45.y, EARTH_G),
  (400 * Math.sin((90 * Math.PI) / 180)) / EARTH_G,
  1e-9
);
// 45° must beat both 30° and 60° — the classic optimum from level ground.
const r30 = horizontalRange(0, resolveLaunch(20, 30).x, resolveLaunch(20, 30).y, EARTH_G);
const r60 = horizontalRange(0, resolveLaunch(20, 60).x, resolveLaunch(20, 60).y, EARTH_G);
const r45 = horizontalRange(0, v45.x, v45.y, EARTH_G);
check('45° maximises range from level ground', r45 > r30 && r45 > r60);
near('30° and 60° are complementary', r30, r60, 1e-9);

// Energy: ½mv² at impact must equal mgh for a pure drop, whatever m is.
const vImpact = impactSpeed(10, 0, 0, EARTH_G);
near('impact speed from 10 m = sqrt(2gh)', vImpact, Math.sqrt(2 * EARTH_G * 10), 1e-12);
near('½v² equals gh (energy conservation)', 0.5 * vImpact * vImpact, EARTH_G * 10, 1e-9);

// 0° must be a purely horizontal throw, 90° purely vertical.
near('0° launch has no vertical component', resolveLaunch(25, 0).y, 0, 1e-12);
near('90° launch has no horizontal component', resolveLaunch(25, 90).x, 0, 1e-12);

// ------------------------------------------------------------- integrator --

section('RK4 integrator');

{
  // With rho = 0 the ODE is linear in t, so RK4 must be exact, not merely close.
  const model = { g: EARTH_G, k: 0 };
  let s = { x: 0, y: 50, vx: 8, vy: 12 };
  const dt = FIXED_DT;
  const steps = 400;
  for (let i = 0; i < steps; i++) s = rk4Step(s, model, dt);
  const t = steps * dt;
  near('RK4 y matches closed form (no drag)', s.y, positionY(50, 12, EARTH_G, t), 1e-9);
  near('RK4 vy matches closed form (no drag)', s.vy, velocityY(12, EARTH_G, t), 1e-9);
  near('RK4 x matches closed form (no drag)', s.x, 8 * t, 1e-9);
}

{
  // Drag must oppose motion on both axes and vanish at rest.
  const model = { g: EARTH_G, k: 0.01 };
  const moving = derivative({ x: 0, y: 10, vx: 5, vy: -5 }, model);
  check('drag opposes rightward motion', moving.vx < 0);
  check('drag opposes downward motion (slows the fall)', moving.vy > -EARTH_G);
  const atRest = derivative({ x: 0, y: 10, vx: 0, vy: 0 }, model);
  near('no drag at zero speed', atRest.vx, 0, 1e-15);
  near('at rest, acceleration is exactly -g', atRest.vy, -EARTH_G, 1e-15);
}

{
  // Analytic check for 1-D quadratic drag from rest:
  //   v(t) = -v_t * tanh(g t / v_t)
  const model = { g: EARTH_G, k: 0.05 };
  const vt = terminalVelocity(model);
  let s = { x: 0, y: 1000, vx: 0, vy: 0 };
  const dt = FIXED_DT;
  const steps = 240 * 3; // 3 seconds
  for (let i = 0; i < steps; i++) s = rk4Step(s, model, dt);
  const t = steps * dt;
  const expected = -vt * Math.tanh((EARTH_G * t) / vt);
  near('RK4 matches the tanh solution for quadratic drag', s.vy, expected, 1e-6);
}

// -------------------------------------------------------- terminal speeds --

section('Terminal velocity of the presets (Earth)');

function vTerm(presetId: string) {
  const p = PRESETS_BY_ID[presetId];
  return terminalVelocity(buildDragModel(p, ENVIRONMENTS.earth, true));
}

// Reference values recomputed from sqrt(2mg / (rho Cd A)) — see presets.ts.
near('ball ≈ 19.7 m/s', vTerm('ball'), 19.7, 0.6);
near('marble ≈ 30.2 m/s', vTerm('marble'), 30.2, 0.8);
near('feather ≈ 0.80 m/s', vTerm('feather'), 0.8, 0.05);
near('book ≈ 18.7 m/s', vTerm('book'), 18.7, 0.6);
check(
  'no air means no terminal velocity',
  terminalVelocity(buildDragModel(PRESETS_BY_ID.ball, ENVIRONMENTS.earth, false)) === Infinity
);
check(
  'the Moon is a vacuum even with the toggle on',
  terminalVelocity(buildDragModel(PRESETS_BY_ID.feather, ENVIRONMENTS.moon, true)) === Infinity
);

// ----------------------------------------------- the hammer-and-feather bit --

section('Galileo / Apollo 15');

{
  const ball = simulate(params({ presetId: 'ball', dropHeight: 10 }), FIXED_DT);
  const feather = simulate(params({ presetId: 'feather', dropHeight: 10 }), FIXED_DT);
  const marble = simulate(params({ presetId: 'marble', dropHeight: 10 }), FIXED_DT);

  near('vacuum: ball and feather land together', feather.totalTime, ball.totalTime, 1e-9);
  near('vacuum: marble lands with them too', marble.totalTime, ball.totalTime, 1e-9);
  near(
    'vacuum: fall time is exactly sqrt(2h/g)',
    ball.totalTime,
    timeToFall(10, EARTH_G),
    1e-6
  );
  near('vacuum: identical impact speeds', feather.impactSpeed, ball.impactSpeed, 1e-9);
}

{
  const ball = simulate(params({ presetId: 'ball', dropHeight: 10, airResistance: true }), FIXED_DT);
  const feather = simulate(
    params({ presetId: 'feather', dropHeight: 10, airResistance: true }),
    FIXED_DT
  );
  check(
    'with air: the feather takes far longer than the ball',
    feather.totalTime > ball.totalTime * 5,
    `feather ${feather.totalTime.toFixed(2)}s vs ball ${ball.totalTime.toFixed(2)}s`
  );
  check(
    'with air: the ball is barely slowed at 10 m',
    ball.totalTime < timeToFall(10, EARTH_G) * 1.1,
    `${ball.totalTime.toFixed(3)}s vs vacuum ${timeToFall(10, EARTH_G).toFixed(3)}s`
  );
  check(
    'with air: the feather arrives at terminal velocity',
    Math.abs(feather.impactSpeed - feather.terminalVelocity) < 0.02,
    `impact ${feather.impactSpeed.toFixed(3)} vs terminal ${feather.terminalVelocity.toFixed(3)}`
  );
  check(
    'with air: drag can only slow things down',
    ball.impactSpeed < Math.sqrt(2 * EARTH_G * 10)
  );
}

{
  // On the Moon the toggle is inert, so the Apollo 15 result holds either way.
  const on = simulate(
    params({ presetId: 'feather', environmentId: 'moon', airResistance: true }),
    FIXED_DT
  );
  const off = simulate(
    params({ presetId: 'ball', environmentId: 'moon', airResistance: false }),
    FIXED_DT
  );
  near('Moon: hammer and feather still land together', on.totalTime, off.totalTime, 1e-9);
  near('Moon: fall time uses g = 1.62', on.totalTime, timeToFall(10, 1.62), 1e-6);
}

{
  // Mars has air, but only 1/60th as much, so the feather is still slow-ish
  // yet dramatically faster than on Earth.
  const mars = simulate(
    params({ presetId: 'feather', environmentId: 'mars', airResistance: true }),
    FIXED_DT
  );
  const earth = simulate(
    params({ presetId: 'feather', environmentId: 'earth', airResistance: true }),
    FIXED_DT
  );
  const marsVacuum = timeToFall(10, ENVIRONMENTS.mars.gravity);
  check(
    'Mars air slows the feather less than Earth air',
    mars.totalTime < earth.totalTime,
    `mars ${mars.totalTime.toFixed(2)}s vs earth ${earth.totalTime.toFixed(2)}s`
  );
  check(
    'Mars still slows it below the vacuum time',
    mars.totalTime > marsVacuum,
    `mars ${mars.totalTime.toFixed(2)}s vs vacuum ${marsVacuum.toFixed(2)}s`
  );
}

// ------------------------------------------------------ simulator plumbing --

section('Simulator');

{
  // The stepped simulation must agree with the analytic answer it replaces.
  const r = simulate(params({ dropHeight: 45, speed: 18, angleDeg: 55 }), FIXED_DT);
  const v = resolveLaunch(18, 55);
  near('projectile flight time matches the quadratic', r.totalTime, timeOfFlight(45, v.y, EARTH_G), 1e-6);
  near('projectile apex matches y0 + v0y²/2g', r.maxHeight, apexHeight(45, v.y, EARTH_G), 1e-4);
  near('projectile range matches vx·t', r.distance, horizontalRange(45, v.x, v.y, EARTH_G), 1e-4);
  check('a 55° launch is recorded as having risen', r.rose);
  near('impact energy is ½mv²', r.impactEnergy, 0.5 * PRESETS_BY_ID.ball.mass * r.impactSpeed ** 2, 1e-9);
}

{
  const r = simulate(params({ dropHeight: 20, speed: 0 }), FIXED_DT);
  check('a pure drop never rises', !r.rose);
  near('a pure drop lands directly below the release point', r.distance, 0, 1e-12);
  check('the run ends by landing', r.outcome === 'landed');
}

{
  // The landing search must place the object exactly on the ground, not below
  // it, and the reported speed must be the speed at that instant.
  const r = simulate(params({ dropHeight: 30, airResistance: true }), FIXED_DT);
  const last = r.samples[r.samples.length - 1];
  near('lands exactly on y = 0', last.y, 0, 1e-9);
  near('reported impact speed matches the final sample', r.impactSpeed, last.speed, 1e-9);
  check('impact speed never exceeds terminal velocity', r.impactSpeed <= r.terminalVelocity + 1e-6);
}

{
  // Timestep independence: halving dt must not move the answer.
  const p = params({ presetId: 'book', dropHeight: 60, airResistance: true, speed: 12, angleDeg: 40 });
  const coarse = simulate(p, 1 / 120);
  const fine = simulate(p, 1 / 960);
  near('flight time is timestep-independent', coarse.totalTime, fine.totalTime, 1e-4);
  near('impact speed is timestep-independent', coarse.impactSpeed, fine.impactSpeed, 1e-4);
}

section('Zero-G');

{
  const still = simulate(params({ environmentId: 'zerog', speed: 0 }), FIXED_DT);
  check('nothing pushing it means it floats', still.outcome === 'floating');
  near('a floating object keeps its height', still.samples[0].y, 10, 1e-12);

  const drifting = simulate(params({ environmentId: 'zerog', speed: 5, angleDeg: 20 }), FIXED_DT);
  check('a nudged object reaches a chamber wall', drifting.outcome === 'boundary');
  near('zero-G motion is at constant speed', drifting.impactSpeed, 5, 1e-6);
  const vz = resolveLaunch(5, 20);
  near(
    'zero-G drift is a straight line: x = vx·t',
    drifting.samples[drifting.samples.length - 1].x,
    vz.x * drifting.totalTime,
    1e-4
  );
}

// -------------------------------------------------------------- collisions --

section('Collisions — conservation laws');

function bodies(m1: number, v1: number, m2: number, v2: number) {
  return {
    a: { mass: m1, velocity: v1, position: -3, radius: 0.2 },
    b: { mass: m2, velocity: v2, position: 3, radius: 0.2 },
  };
}

function runCollision(
  m1: number,
  v1: number,
  m2: number,
  v2: number,
  kind: 'bouncy' | 'sticky' | 'realistic',
  restitution = 0.7
) {
  const { a, b } = bodies(m1, v1, m2, v2);
  return simulateCollision({ a, b, kind, restitution, halfTrack: 8 }, FIXED_DT);
}

{
  // Momentum must survive every collision type, at every restitution.
  for (const [kind, e] of [
    ['bouncy', 1],
    ['sticky', 0],
    ['realistic', 0.7],
  ] as const) {
    const sim = runCollision(2, 4, 3, -1, kind, e);
    const ev = sim.event!;
    near(`${kind}: momentum is conserved`, ev.momentumAfter, ev.momentumBefore, 1e-9);
  }
  // ...and at a spread of arbitrary restitutions.
  for (const e of [0.15, 0.42, 0.88]) {
    const r = resolveCollision(1.7, 6, 4.3, -2.5, e);
    near(
      `momentum conserved at e = ${e}`,
      1.7 * r.v1 + 4.3 * r.v2,
      1.7 * 6 + 4.3 * -2.5,
      1e-9
    );
  }
}

{
  // Elastic collisions conserve kinetic energy exactly.
  const sim = runCollision(2, 5, 3, -2, 'bouncy');
  const ev = sim.event!;
  near('bouncy: kinetic energy is conserved', ev.energyAfter, ev.energyBefore, 1e-9);
  near('bouncy: no energy lost', ev.energyLost, 0, 1e-9);
  // Restitution definition: separation speed equals approach speed when e = 1.
  near(
    'bouncy: they separate as fast as they closed',
    ev.bAfter - ev.aAfter,
    ev.aBefore - ev.bBefore,
    1e-9
  );
}

{
  // The spec's explicit elastic formulas, checked directly.
  const m1 = 2;
  const m2 = 3;
  const v1 = 5;
  const v2 = -2;
  const r = resolveCollision(m1, v1, m2, v2, 1);
  near(
    "elastic v1' matches ((m1-m2)/M)v1 + (2m2/M)v2",
    r.v1,
    ((m1 - m2) / (m1 + m2)) * v1 + ((2 * m2) / (m1 + m2)) * v2,
    1e-12
  );
  near(
    "elastic v2' matches (2m1/M)v1 + ((m2-m1)/M)v2",
    r.v2,
    ((2 * m1) / (m1 + m2)) * v1 + ((m2 - m1) / (m1 + m2)) * v2,
    1e-12
  );
}

{
  // Equal masses, one stationary: the classic full transfer of velocity.
  const r = resolveCollision(1, 7, 1, 0, 1);
  near('equal masses: the mover stops dead', r.v1, 0, 1e-12);
  near('equal masses: the target takes the whole speed', r.v2, 7, 1e-12);
}

{
  // A very heavy body barely notices a very light one bouncing off it.
  const r = resolveCollision(1000, 0, 0.01, -5, 1);
  check('a light ball rebounds off a heavy one', r.v2 > 4.9 && r.v2 <= 5.0);
  check('the heavy body is barely moved', Math.abs(r.v1) < 0.001);
}

{
  // Perfectly inelastic: one common velocity, from the momentum equation.
  const m1 = 4;
  const m2 = 1;
  const v1 = 3;
  const v2 = -2;
  const r = resolveCollision(m1, v1, m2, v2, 0);
  const combined = (m1 * v1 + m2 * v2) / (m1 + m2);
  near('sticky: both end at (m1v1+m2v2)/M', r.v1, combined, 1e-12);
  near('sticky: the two velocities are identical', r.v1, r.v2, 1e-15);

  const sim = runCollision(m1, v1, m2, v2, 'sticky');
  check('sticky: the run reports them joined', sim.event!.stuck && sim.stuck);
  check('sticky: energy is lost', sim.event!.energyLost > 0);
  near(
    'sticky: they stay exactly touching afterwards',
    sim.b.position - sim.a.position,
    sim.a.radius + sim.b.radius,
    1e-6
  );
}

{
  // Partially inelastic must sit strictly between the two extremes.
  const args = [2, 4, 3, -1] as const;
  const elastic = resolveCollision(...args, 1);
  const inelastic = resolveCollision(...args, 0);
  const partial = resolveCollision(...args, 0.7);
  check(
    'realistic sits between bouncy and sticky',
    partial.v1 > elastic.v1 && partial.v1 < inelastic.v1
  );
  const eOf = (r: { v1: number; v2: number }) => (r.v2 - r.v1) / (args[1] - args[3]);
  near('the restitution comes back out as 0.7', eOf(partial), 0.7, 1e-12);
  near('e = 1 recovers a bouncy collision', eOf(elastic), 1, 1e-12);
  near('e = 0 recovers a sticky one', eOf(inelastic), 0, 1e-12);
}

{
  // Energy loss must rise as bounciness falls, never the other way.
  let previous = -1;
  for (const e of [1, 0.8, 0.6, 0.4, 0.2, 0]) {
    const sim = runCollision(2, 5, 3, -2, e === 1 ? 'bouncy' : 'realistic', e);
    const lost = sim.event!.energyLost;
    check(`energy lost grows as e falls (e = ${e})`, lost > previous - 1e-12);
    previous = lost;
  }
}

section('Collisions — the track');

{
  const sim = runCollision(1, 3, 1, 0, 'bouncy');
  check('a collision is detected', sim.event !== null);
  check('contact happens where they touch', Math.abs(sim.event!.position) < 8);
  near('closing speed is recorded', sim.event!.approachSpeed, 3, 1e-9);
}

{
  // Moving apart from the start: they must never meet.
  const { a, b } = bodies(1, -2, 1, 2);
  const sim = simulateCollision(
    { a, b, kind: 'bouncy', restitution: 1, halfTrack: 8 },
    FIXED_DT
  );
  check('bodies moving apart never collide', sim.event === null);
  check('the run reports no contact', sim.outcome === 'no-contact');
}

{
  // Both stationary: nothing should happen at all.
  const { a, b } = bodies(1, 0, 1, 0);
  const sim = simulateCollision(
    { a, b, kind: 'bouncy', restitution: 1, halfTrack: 8 },
    FIXED_DT
  );
  check('two still objects stay still', sim.event === null && sim.t === 0);
}

{
  // Nothing may ever leave the track.
  const sim = runCollision(5, 9, 0.2, 0, 'bouncy');
  const h = 8;
  check(
    'bodies stay within the end stops',
    sim.a.position - sim.a.radius >= -h - 1e-6 &&
      sim.b.position + sim.b.radius <= h + 1e-6
  );
}

{
  // Halving the timestep must not change the outcome.
  const { a, b } = bodies(2.5, 6, 1.5, -3);
  const coarse = simulateCollision(
    { a: { ...a }, b: { ...b }, kind: 'realistic', restitution: 0.65, halfTrack: 8 },
    1 / 120
  );
  const fine = simulateCollision(
    { a: { ...a }, b: { ...b }, kind: 'realistic', restitution: 0.65, halfTrack: 8 },
    1 / 960
  );
  near('contact time is timestep-independent', fine.event!.time, coarse.event!.time, 2e-2);
  near("v1' is timestep-independent", fine.event!.aAfter, coarse.event!.aAfter, 1e-9);
  near("v2' is timestep-independent", fine.event!.bAfter, coarse.event!.bAfter, 1e-9);
}

// -------------------------------------------------------------------- circuits --

section('Circuits — Ohm\'s Law');

{
  const r = resolveCircuit({
    voltage: 9,
    switchClosed: true,
    bulbCount: 1,
    wiring: 'series',
    bulbs: [{ resistance: 3 }],
    burnedOut: [false, false],
  });
  near('single bulb: I = V/R', r.totalCurrent, 3, 1e-12);
  near('single bulb: full voltage across it', r.bulbs[0].voltage, 9, 1e-12);
  near('single bulb: power = V·I', r.bulbs[0].power, 27, 1e-9);
}

{
  const r = resolveCircuit({
    voltage: 9,
    switchClosed: false,
    bulbCount: 1,
    wiring: 'series',
    bulbs: [{ resistance: 3 }],
    burnedOut: [false, false],
  });
  check('open switch: no current', r.totalCurrent === 0);
  check('open switch: bulb is dark', r.bulbs[0].brightness === 0);
}

section('Circuits — series');

{
  const r = resolveCircuit({
    voltage: 12,
    switchClosed: true,
    bulbCount: 2,
    wiring: 'series',
    bulbs: [{ resistance: 4 }, { resistance: 8 }],
    burnedOut: [false, false],
  });
  near('series: R_total = R1 + R2', r.totalResistance, 12, 1e-12);
  near('series: same current through both', r.bulbs[0].current, r.bulbs[1].current, 1e-12);
  near('series: I = V / R_total', r.totalCurrent, 1, 1e-12);
  near('series: voltage divides by resistance', r.bulbs[1].voltage, 8, 1e-9);
  near(
    'series: voltage drops sum to the battery voltage',
    r.bulbs[0].voltage + r.bulbs[1].voltage,
    12,
    1e-9
  );
}

{
  // A burned-out bulb in series breaks the whole loop.
  const r = resolveCircuit({
    voltage: 9,
    switchClosed: true,
    bulbCount: 2,
    wiring: 'series',
    bulbs: [{ resistance: 4 }, { resistance: 8 }],
    burnedOut: [true, false],
  });
  check('series: a burned-out bulb kills the current', r.totalCurrent === 0);
  check('series: the intact bulb goes dark too', r.bulbs[1].current === 0 && r.bulbs[1].brightness === 0);
}

section('Circuits — parallel');

{
  const r = resolveCircuit({
    voltage: 12,
    switchClosed: true,
    bulbCount: 2,
    wiring: 'parallel',
    bulbs: [{ resistance: 4 }, { resistance: 8 }],
    burnedOut: [false, false],
  });
  near('parallel: 1/R_total = 1/R1 + 1/R2', r.totalResistance, 1 / (1 / 4 + 1 / 8), 1e-9);
  near('parallel: full voltage across each bulb', r.bulbs[0].voltage, 12, 1e-12);
  near('parallel: full voltage across each bulb', r.bulbs[1].voltage, 12, 1e-12);
  near('parallel: current divides inversely with resistance', r.bulbs[0].current, 3, 1e-9);
  near('parallel: current divides inversely with resistance', r.bulbs[1].current, 1.5, 1e-9);
  near(
    'parallel: total current is the sum of the branches',
    r.totalCurrent,
    r.bulbs[0].current + r.bulbs[1].current,
    1e-9
  );
}

{
  // A burned-out bulb in parallel only takes out its own branch.
  const r = resolveCircuit({
    voltage: 9,
    switchClosed: true,
    bulbCount: 2,
    wiring: 'parallel',
    bulbs: [{ resistance: 4 }, { resistance: 8 }],
    burnedOut: [true, false],
  });
  check('parallel: the burned-out branch carries nothing', r.bulbs[0].current === 0);
  near('parallel: the other bulb is unaffected', r.bulbs[1].current, 9 / 8, 1e-9);
}

section('Circuits — power and burnout');

{
  // Overload reduces to "more than the reference voltage across the bulb",
  // independent of resistance — check that identity directly.
  for (const resistance of [1, 10, 50, 100]) {
    const safe = safePowerFor(resistance);
    near(
      `safe power at R=${resistance} matches Vref²/R`,
      safe,
      (REFERENCE_SAFE_VOLTAGE * REFERENCE_SAFE_VOLTAGE) / resistance,
      1e-9
    );
  }
}

{
  const under = resolveCircuit({
    voltage: 10,
    switchClosed: true,
    bulbCount: 1,
    wiring: 'series',
    bulbs: [{ resistance: 20 }],
    burnedOut: [false, false],
  });
  check('under the safe voltage: not overloaded', !under.bulbs[0].overloaded);

  const over = resolveCircuit({
    voltage: 24,
    switchClosed: true,
    bulbCount: 1,
    wiring: 'series',
    bulbs: [{ resistance: 20 }],
    burnedOut: [false, false],
  });
  check('over the safe voltage: overloaded', over.bulbs[0].overloaded);
}

{
  // Brightness must climb monotonically with power up to the overload point.
  let previous = -1;
  for (const voltage of [1, 4, 8, 11.9]) {
    const r = resolveCircuit({
      voltage,
      switchClosed: true,
      bulbCount: 1,
      wiring: 'series',
      bulbs: [{ resistance: 10 }],
      burnedOut: [false, false],
    });
    check(`brightness rises with voltage (${voltage}V)`, r.bulbs[0].brightness > previous);
    previous = r.bulbs[0].brightness;
  }
  const atLimit = resolveCircuit({
    voltage: REFERENCE_SAFE_VOLTAGE,
    switchClosed: true,
    bulbCount: 1,
    wiring: 'series',
    bulbs: [{ resistance: 10 }],
    burnedOut: [false, false],
  });
  near('brightness saturates at exactly the safe limit', atLimit.bulbs[0].brightness, 1, 1e-9);
}

{
  const burned = resolveCircuit({
    voltage: 9,
    switchClosed: true,
    bulbCount: 1,
    wiring: 'series',
    bulbs: [{ resistance: 10 }],
    burnedOut: [true, false],
  });
  check('a burned-out bulb draws no current', burned.bulbs[0].current === 0);
  check('a burned-out bulb is never counted as overloaded again', !burned.bulbs[0].overloaded);
  check('a burned-out bulb has zero brightness', burned.bulbs[0].brightness === 0);
}

// -------------------------------------------------------------------- magnetism --

section('Magnetism — force');

{
  // Textbook inverse-square, and doubling either pole strength doubles F.
  const base = computeForce({ distance: 10, strengthA: 20, strengthB: 20, orientation: 'attract' });
  near('F = k·p1·p2/r²', base.magnitude, (20 * 20) / 100, 1e-9);
  check('attract orientation reports attracting', base.attracting);

  const doubledA = computeForce({ distance: 10, strengthA: 40, strengthB: 20, orientation: 'attract' });
  near('doubling one pole strength doubles the force', doubledA.magnitude, base.magnitude * 2, 1e-9);

  const doubledDistance = computeForce({ distance: 20, strengthA: 20, strengthB: 20, orientation: 'attract' });
  near('doubling distance quarters the force', doubledDistance.magnitude, base.magnitude / 4, 1e-9);

  const repel = computeForce({ distance: 10, strengthA: 20, strengthB: 20, orientation: 'repel' });
  near('magnitude does not depend on orientation', repel.magnitude, base.magnitude, 1e-9);
  check('repel orientation reports not attracting', !repel.attracting);
}

{
  // forceFraction must stay bounded and rise monotonically with magnitude.
  check('forceFraction(0) is 0', forceFraction(0) === 0);
  let previous = -1;
  for (const m of [0, 1, 10, 100, 1000, 100000]) {
    const f = forceFraction(m);
    check(`forceFraction rises with magnitude (${m})`, f >= previous);
    check(`forceFraction(${m}) stays within [0,1]`, f >= 0 && f <= 1);
    previous = f;
  }
}

section('Magnetism — field model');

{
  // A lone north pole's field points straight away from it, falling off as 1/r².
  const poles = [{ x: 0, y: 0, strength: 10 }];
  const near1 = fieldVectorAt(5, 0, poles);
  const near2 = fieldVectorAt(10, 0, poles);
  check('field points away from an isolated north pole', near1.x > 0 && Math.abs(near1.y) < 1e-9);
  near(
    'field falls off as 1/r² (doubling r quarters the magnitude)',
    Math.hypot(near2.x, near2.y),
    Math.hypot(near1.x, near1.y) / 4,
    1e-6
  );
}

{
  // Two poles of a bar magnet: N at +half, S at -half. Between them, on the
  // axis, both poles push/pull a test point in the same +x direction.
  const [n, s] = magnetPoles(0, 15, true);
  check('magnetPoles: north carries positive strength', n.strength > 0);
  check('magnetPoles: south carries negative strength', s.strength < 0);
  const mid = fieldVectorAt(0, 0, [n, s]);
  check('field between the poles points from N to S', mid.x < 0);
}

section('Magnetism — field lines');

{
  const [n, s] = magnetPoles(0, 20, true);
  const bounds = { minX: -20, maxX: 20, minY: -20, maxY: 20 };
  const lines = traceFieldLines([n, s], {
    count: 6,
    maxSteps: 200,
    stepLength: 0.3,
    captureRadius: 0.8,
    bounds,
  });
  check('field lines are traced from the north pole', lines.length === 6);
  check('every line has more than one point', lines.every((l) => l.points.length > 1));
  check(
    'every point stays within the requested bounds',
    lines.every((l) =>
      l.points.every(
        (p) => p.x >= bounds.minX - 1e-6 && p.x <= bounds.maxX + 1e-6 && p.y >= bounds.minY - 1e-6 && p.y <= bounds.maxY + 1e-6
      )
    )
  );
  // A field line seeded near the N pole of a simple isolated bar magnet
  // should curve around and arrive near the S pole, not wander off to infinity.
  const closestToS = Math.min(
    ...lines.map((l) => Math.min(...l.points.map((p) => Math.hypot(p.x - s.x, p.y - s.y))))
  );
  check('at least one field line arrives close to the south pole', closestToS < 2);
}

// ---------------------------------------------------------- boundary values --
//
// What actually happens at the extreme ends of every slider in the app —
// the exact min/max pairs from LIMITS, plus a couple of values a user could
// never reach through the UI (R = 0, distance = 0) but that the pure
// functions should still survive, since nothing stops another caller from
// passing them in directly.

section('Boundary values — Drop & Projectile');

{
  const combos: Partial<SimParams>[] = [
    { mass: 0.0005, dropHeight: 0.5, speed: 0, angleDeg: 0, airResistance: false },
    { mass: 0.0005, dropHeight: 100, speed: 50, angleDeg: 90, airResistance: true },
    { mass: 50, dropHeight: 100, speed: 50, angleDeg: 0, airResistance: true },
    { mass: 50, dropHeight: 0.5, speed: 0, angleDeg: 0, airResistance: false },
  ];
  for (const over of combos) {
    const p = params({ presetId: 'ball', ...over });
    const r = simulate(p, FIXED_DT);
    const label = `m=${p.mass} h=${p.dropHeight} v=${p.speed} θ=${p.angleDeg} air=${p.airResistance}`;
    check(`finite total time (${label})`, Number.isFinite(r.totalTime));
    check(`finite impact speed (${label})`, Number.isFinite(r.impactSpeed));
    check(`finite distance travelled (${label})`, Number.isFinite(r.distance));
    check(`a recognised outcome (${label})`, ['landed', 'boundary', 'timeout', 'floating'].includes(r.outcome));
  }
}

section('Boundary values — Collisions');

{
  const extremes: [number, number, number, number][] = [
    [0.0005, 15, 0.0005, -15],
    [50, 15, 50, -15],
    [0.0005, 15, 50, -15],
    [50, 15, 0.0005, -15],
  ];
  for (const [m1, v1, m2, v2] of extremes) {
    for (const e of [0, 1] as const) {
      const sim = runCollision(m1, v1, m2, v2, e === 1 ? 'bouncy' : 'sticky', e);
      const label = `m1=${m1} m2=${m2} e=${e}`;
      check(`a contact is resolved (${label})`, sim.event !== null);
      check(`finite post-impact velocities (${label})`, Number.isFinite(sim.event!.aAfter) && Number.isFinite(sim.event!.bAfter));
      check(`finite energy figures (${label})`, Number.isFinite(sim.event!.energyLost));
      near(`momentum still conserved at the extremes (${label})`, sim.event!.momentumAfter, sim.event!.momentumBefore, 1e-6);
    }
  }
}

section('Boundary values — Circuits');

{
  const cases: { voltage: number; resistance: number; bulbCount: 1 | 2; wiring: 'series' | 'parallel' }[] = [
    { voltage: 1, resistance: 1, bulbCount: 1, wiring: 'series' },
    { voltage: 24, resistance: 100, bulbCount: 1, wiring: 'series' },
    { voltage: 24, resistance: 1, bulbCount: 2, wiring: 'series' },
    { voltage: 24, resistance: 1, bulbCount: 2, wiring: 'parallel' },
    { voltage: 1, resistance: 100, bulbCount: 2, wiring: 'parallel' },
  ];
  for (const c of cases) {
    const r = resolveCircuit({
      voltage: c.voltage,
      switchClosed: true,
      bulbCount: c.bulbCount,
      wiring: c.wiring,
      bulbs: [{ resistance: c.resistance }, { resistance: c.resistance }],
      burnedOut: [false, false],
    });
    const label = `V=${c.voltage} R=${c.resistance} n=${c.bulbCount} ${c.wiring}`;
    check(`finite total current (${label})`, Number.isFinite(r.totalCurrent));
    check(`finite total power (${label})`, Number.isFinite(r.totalPower));
    check(
      `every bulb reading is finite (${label})`,
      r.bulbs.every((b) => Number.isFinite(b.current) && Number.isFinite(b.voltage) && Number.isFinite(b.power))
    );
  }
}

{
  // R = 0 can never reach this function through the UI (LIMITS.resistanceMin
  // is 1), but the pure function is still exercised directly here. A 0 Ω
  // bulb makes the parallel combination 0 Ω too — this model has no internal
  // battery resistance to bound the resulting current, so rather than
  // reporting Infinity it treats a dead short as an open loop (no current
  // anywhere). That is a deliberate simplification, not a crash — this test
  // exists to pin the behaviour down and flag it if it ever changes.
  const shorted = resolveCircuit({
    voltage: 9,
    switchClosed: true,
    bulbCount: 2,
    wiring: 'parallel',
    bulbs: [{ resistance: 0 }, { resistance: 20 }],
    burnedOut: [false, false],
  });
  check('a 0 Ω branch does not produce NaN or Infinity', Number.isFinite(shorted.totalCurrent));
  check('a 0 Ω branch is treated as an open loop, not infinite current', shorted.totalCurrent === 0);
}

section('Boundary values — Magnets');

{
  const cases: { distance: number; strength: number }[] = [
    { distance: 1, strength: 1 },
    { distance: 1, strength: 100 },
    { distance: 50, strength: 1 },
    { distance: 50, strength: 100 },
  ];
  for (const c of cases) {
    for (const orientation of ['attract', 'repel'] as const) {
      const f = computeForce({ distance: c.distance, strengthA: c.strength, strengthB: c.strength, orientation });
      const label = `r=${c.distance} p=${c.strength} ${orientation}`;
      check(`finite force magnitude (${label})`, Number.isFinite(f.magnitude));
      const frac = forceFraction(f.magnitude);
      check(`forceFraction stays in [0,1] (${label})`, frac >= 0 && frac <= 1);
    }
  }
}

{
  // distance = 0 can never reach the UI either (min is 1 cm), but the
  // formula clamps internally rather than dividing by zero.
  const touching = computeForce({ distance: 0, strengthA: 100, strengthB: 100, orientation: 'attract' });
  check('distance = 0 does not produce NaN or Infinity', Number.isFinite(touching.magnitude));
}

// ------------------------------------------------------------------ report --

console.log('');
if (failures.length === 0) {
  console.log(`[32m${passed} checks passed.[0m`);
  process.exit(0);
} else {
  console.log(`[31m${failures.length} failed[0m, ${passed} passed:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
