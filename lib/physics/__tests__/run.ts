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
