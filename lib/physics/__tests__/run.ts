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
