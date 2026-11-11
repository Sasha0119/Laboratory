/**
 * Physics unit tests.
 *
 * Run with:  npm run test:physics
 *
 * Deliberately dependency-free (no jest/vitest) so the checks run with plain
 * `tsx` and stay easy to execute while iterating on the equations. Everything
 * under test is a pure function or the UI-free `Simulator`.
 */

import { ENVIRONMENTS, ENVIRONMENT_ORDER, FIXED_DT, LIMITS } from '../constants';
import { buildDragModel, derivative, integrate, rk4Step, terminalVelocity } from '../drag';
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
import { PRESETS, PRESETS_BY_ID } from '../presets';
import {
  SPEED_LIMIT_TOLERANCE,
  Simulator,
  simulate,
  speedLimit,
  type SimParams,
  type SimResult,
} from '../simulation';
import { CollisionSimulator, gapBetween, resolveCollision, simulateCollision } from '../collision';
import { BULB_RATED_POWER, resolveCircuit, safePowerFor } from '../circuit';
import {
  computeForce,
  fieldVectorAt,
  forceFraction,
  magnetPoles,
  traceFieldLines,
} from '../magnetism';
import {
  ABSOLUTE_ZERO_C,
  CUSTOM_DEFAULT,
  MAX_TEMPERATURE_C,
  PRESET_ORDER,
  PRESET_SUBSTANCES,
  SUBSTANCE_MASS,
  addHeat,
  atLimit,
  enthalpyForTemperature,
  heatBetween,
  heatLevel,
  heatToChangePhase,
  heatToWarm,
  isValidSubstance,
  latentHeatFor,
  specificHeatFor,
  stateAt,
  thresholds,
  type Substance,
} from '../thermo';
import { MatterEngine, PARTICLE_COUNT, type EngineInput } from '../../matter/engine';
import {
  HAND_PACE,
  MAX_FALL_SPEED,
  MAX_LIFT_TIME,
  MIN_LIFT_TIME,
  START,
  liftDuration,
  loadSpeed,
  motionStatus,
  stepMotion,
  type Lane,
  type Motion,
} from '../../machines/motion';
import {
  MACHINE_LIMITS,
  PULLEY_TRAVEL,
  effortRatio,
  inclineAnalysis,
  inclineWork,
  isEnough,
  leverAngle,
  leverAnalysis,
  leverGeometry,
  leverWork,
  maxRampHeight,
  pulleyAnalysis,
  pulleyLayout,
  pulleyWork,
  roundUpEffort,
  supportingSegments,
  weightOf,
  work,
} from '../machines';
import {
  MATERIALS,
  MATERIAL_ORDER,
  MAX_WAVE_GAIN,
  WAVE_LIMITS,
  audioMix,
  beatBand,
  beatEnvelope,
  beatFrequency,
  displacement,
  displacementAtPhase,
  displayRate,
  gainForAmplitude,
  loudnessBand,
  niceCeil,
  niceFloor,
  period,
  pitchBand,
  slowdownFactor,
  superpose,
  timeScale,
  viewWidth,
  wavelength,
} from '../waves';

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

section('Stiff drag: very light objects stay physical');

/**
 * Everything that must hold for any run with drag on: no NaN or Infinity
 * anywhere, never faster than max(launch speed, terminal velocity), and a
 * landing from a real height takes real time. Returns a reason, or '' if fine.
 */
function physicalProblem(p: SimParams, r: SimResult): string {
  if (r.outcome === 'invalid') return 'run was flagged invalid';
  const numbers = [r.totalTime, r.impactSpeed, r.impactVy, r.maxHeight, r.distance, r.peakSpeed, r.impactEnergy];
  if (!numbers.every(Number.isFinite)) return `non-finite result ${numbers.join(', ')}`;
  for (const s of r.samples) {
    if (![s.t, s.x, s.y, s.vx, s.vy, s.speed].every(Number.isFinite)) return `non-finite sample at t=${s.t}`;
  }
  const model = buildDragModel(p, ENVIRONMENTS[p.environmentId], p.airResistance);
  const cap = Math.max(p.speed, terminalVelocity(model)) * (1 + SPEED_LIMIT_TOLERANCE) + 1e-9;
  if (r.peakSpeed > cap) return `peak ${r.peakSpeed} m/s above the cap ${cap} m/s`;
  if (r.outcome === 'landed' && !(r.totalTime > 0.01)) return `landed after ${r.totalTime} s`;
  return '';
}

{
  // The exact cases from the audit.
  const feather = { mass: 0.0008, dragCoefficient: 2.5, area: 0.008 };
  const auditParams = params({ ...feather, dropHeight: 10, speed: 50, angleDeg: 45, airResistance: true });
  const audit = simulate(auditParams, FIXED_DT);
  const auditProblem = physicalProblem(auditParams, audit);
  check('feather at 50 m/s, 45°: no impossible numbers', auditProblem === '', auditProblem);
  check('feather at 50 m/s, 45°: lands', audit.outcome === 'landed');
  check('feather at 50 m/s, 45°: takes seconds, not 0.00 s', audit.totalTime > 10, `${audit.totalTime} s`);
  near('feather at 50 m/s, 45°: arrives at terminal velocity', audit.impactSpeed, audit.terminalVelocity, 0.01);

  for (let speed = 40; speed <= 50; speed++) {
    for (const angleDeg of [0, 30, 45, 60, 90]) {
      const p = params({ ...feather, speed, angleDeg, airResistance: true });
      const problem = physicalProblem(p, simulate(p, FIXED_DT));
      check(`feather on Earth at ${speed} m/s, ${angleDeg}°`, problem === '', problem);
    }
  }

  // Light custom sheet: 0.5 g, Cd 3, 1 m². It used to fail even at 1 m/s.
  const sheet = { mass: 0.0005, dragCoefficient: 3, area: 1 };
  for (const speed of [1, 10, 50]) {
    for (const dropHeight of [LIMITS.heightMin, 10]) {
      const p = params({ ...sheet, speed, angleDeg: 45, dropHeight, airResistance: true });
      const problem = physicalProblem(p, simulate(p, FIXED_DT));
      check(`light custom sheet at ${speed} m/s from ${dropHeight} m`, problem === '', problem);
    }
  }
  {
    // Terminal velocity is about 5 cm/s, so half a metre takes ~10 s.
    const p = params({ ...sheet, speed: 1, angleDeg: 45, dropHeight: LIMITS.heightMin, airResistance: true });
    const r = simulate(p, FIXED_DT);
    check(
      'light custom sheet drifts down slowly and lands',
      r.outcome === 'landed' && r.totalTime > 5,
      `${r.outcome} ${r.totalTime} s`
    );
    near('...at its terminal velocity', r.impactSpeed, r.terminalVelocity, 1e-3);
  }
}

{
  // Every preset (plus the extremes a Custom object can reach) in every
  // environment, at the minimum, a typical and the maximum launch speed,
  // several angles, and the lowest, a typical and the highest release.
  const objects: { id: string; mass: number; dragCoefficient: number; area: number }[] = [
    ...PRESETS.map((p) => ({ id: p.id, mass: p.mass, dragCoefficient: p.dragCoefficient, area: p.area })),
    { id: 'custom-lightest-draggiest', mass: LIMITS.massMin, dragCoefficient: 3, area: 1 },
    { id: 'custom-heaviest-sleekest', mass: LIMITS.massMax, dragCoefficient: 0.04, area: 0.0001 },
  ];
  const speeds = [LIMITS.velocityMin, 15, LIMITS.velocityMax];
  const angles = [0, 30, 45, 60, 90];
  const heights = [LIMITS.heightMin, 10, LIMITS.heightMax];
  let runs = 0;
  const problems: string[] = [];
  for (const o of objects) {
    for (const environmentId of ENVIRONMENT_ORDER) {
      for (const speed of speeds) {
        for (const angleDeg of angles) {
          for (const dropHeight of heights) {
            const p = params({ ...o, environmentId, speed, angleDeg, dropHeight, airResistance: true });
            const problem = physicalProblem(p, simulate(p, FIXED_DT));
            runs++;
            if (problem) problems.push(`${o.id}/${environmentId}/${speed} m/s/${angleDeg}°/${dropHeight} m: ${problem}`);
          }
        }
      }
    }
  }
  check(
    `all ${runs} preset × environment × speed × angle × height runs are physical`,
    problems.length === 0,
    `${problems.length} bad, e.g. ${problems.slice(0, 3).join(' | ')}`
  );
}

{
  // The fix must not cost accuracy. A vertical drop with quadratic drag has
  // an exact landing time:  t = (v∞/g)·acosh(exp(g·h / v∞²)).
  const cases = [
    ['ball', 1e-9],
    ['marble', 1e-9],
    ['book', 1e-9],
    ['feather', 1e-8],
  ] as const;
  for (const [id, tol] of cases) {
    const p = params({ presetId: id, dropHeight: 10, airResistance: true });
    const vt = terminalVelocity(buildDragModel(p, ENVIRONMENTS.earth, true));
    const exact = (vt / EARTH_G) * Math.acosh(Math.exp((EARTH_G * 10) / (vt * vt)));
    near(`${id}: drop time matches the exact drag solution`, simulate(p, FIXED_DT).totalTime, exact, tol);
  }

  // A stiff launch must now be timestep-independent too.
  const stiff = params({ presetId: 'feather', speed: 25, angleDeg: 90, airResistance: true });
  near(
    'stiff feather launch is timestep-independent',
    simulate(stiff, FIXED_DT).totalTime,
    simulate(stiff, 1 / 4800).totalTime,
    1e-6
  );

  // Ordinary steps are a single RK4 step: sub-stepping only engages when needed.
  const ballModel = buildDragModel(PRESETS_BY_ID.ball, ENVIRONMENTS.earth, true);
  const s0 = { x: 0, y: 10, vx: 30, vy: 30 };
  const a = integrate(s0, ballModel, FIXED_DT);
  const b = rk4Step(s0, ballModel, FIXED_DT);
  check(
    'non-stiff step is bit-for-bit one RK4 step',
    a.x === b.x && a.y === b.y && a.vx === b.vx && a.vy === b.vy
  );

  // Even one large step on a stiff model stays bounded.
  const featherModel = buildDragModel(PRESETS_BY_ID.feather, ENVIRONMENTS.earth, true);
  const big = integrate({ x: 0, y: 10, vx: 35, vy: 35 }, featherModel, 0.25);
  check('one large stiff step never speeds the object up', Math.hypot(big.vx, big.vy) < 50);
}

{
  // Last line of defence: impossible numbers end the run as 'invalid'
  // instead of reaching the screen.
  check(
    'NaN mass is refused, not simulated',
    new Simulator(params({ mass: Number.NaN, airResistance: true })).outcome === 'invalid'
  );
  check(
    'infinite speed is refused, not simulated',
    new Simulator(params({ speed: Infinity, angleDeg: 45 })).outcome === 'invalid'
  );
  check('no speed cap without air', speedLimit(10, { g: EARTH_G, k: 0 }) === Infinity);
  const cap = speedLimit(10, { g: EARTH_G, k: 0.05 });
  check('speed cap is max(launch, terminal) with drag', cap >= 14 && cap < 14.01, `${cap}`);

  // A step that breaks the cap is never committed: the last good state stays.
  const sim = new Simulator(params({ presetId: 'ball', speed: 20, angleDeg: 45, airResistance: true }));
  const good = sim.state;
  (sim as unknown as { speedLimit: number }).speedLimit = 1; // force a violation
  sim.step(FIXED_DT);
  check('a step faster than physics allows ends the run as invalid', sim.outcome === 'invalid');
  check('...and is not shown: the previous state is kept', sim.state === good);
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

{
  // Audit: after one body stops at an end stop, the other used to freeze
  // against it while still reporting a speed. Run step by step and require
  // that a body showing a speed actually moves, in both directions and for
  // every collision type.
  const setups = [
    // Heavy A drives light B into the right-hand wall, then catches it.
    { name: 'heavy into light, right wall', a: { m: 5, v: 6 }, b: { m: 1, v: 0 } },
    // Mirror image: heavy B drives light A into the left-hand wall.
    { name: 'heavy into light, left wall', a: { m: 1, v: 0 }, b: { m: 5, v: -6 } },
    // B reaches the wall before A ever touches it.
    { name: 'both heading right, B first to the wall', a: { m: 2, v: 5 }, b: { m: 2, v: 3 } },
  ];
  for (const setup of setups) {
    for (const [kind, e] of [
      ['bouncy', 1],
      ['realistic', 0.7],
      ['realistic', 0],
      ['sticky', 0],
    ] as const) {
      const sim = new CollisionSimulator({
        a: { mass: setup.a.m, velocity: setup.a.v, position: -2.6, radius: 0.3 },
        b: { mass: setup.b.m, velocity: setup.b.v, position: 2.6, radius: 0.2 },
        kind,
        restitution: e,
        halfTrack: 4,
      });
      let worst = 0;
      let frozen = 0;
      while (!sim.finished) {
        const pa = sim.a.position;
        const pb = sim.b.position;
        sim.step(FIXED_DT);
        // A body is "frozen" if it shows a speed but did not move this step.
        const stuckA = Math.abs(sim.a.velocity) > 1e-3 && Math.abs(sim.a.position - pa) < 1e-9;
        const stuckB = Math.abs(sim.b.velocity) > 1e-3 && Math.abs(sim.b.position - pb) < 1e-9;
        frozen = stuckA || stuckB ? frozen + 1 : 0;
        worst = Math.max(worst, frozen);
      }
      const label = `${setup.name}, ${kind} e=${e}`;
      check(`${label}: displayed speed always means motion`, worst <= 1, `${worst} frozen steps`);
      check(
        `${label}: bodies never overlap`,
        gapBetween(sim.a, sim.b) >= -1e-9,
        `gap ${gapBetween(sim.a, sim.b)}`
      );
      if (sim.event && !sim.event.stuck) {
        near(`${label}: main collision still conserves momentum`, sim.event.momentumAfter, sim.event.momentumBefore, 1e-9);
      }
    }
  }

  // The specific case: equal-ish masses, B pinned at the wall, A arrives.
  // With e = 0 it must stop dead against B, not keep a phantom speed.
  const sim = new CollisionSimulator({
    a: { mass: 5, velocity: 6, position: -2.6, radius: 0.3 },
    b: { mass: 1, velocity: 0, position: 2.6, radius: 0.2 },
    kind: 'realistic',
    restitution: 0,
    halfTrack: 4,
  });
  while (!sim.finished) sim.step(FIXED_DT);
  near('e=0: the arriving body stops against the pinned one', sim.a.velocity, 0, 1e-12);
  near('e=0: the pinned body stays at rest', sim.b.velocity, 0, 1e-12);
  near('e=0: they end up touching', gapBetween(sim.a, sim.b), 0, 1e-9);
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
  // One rating for every bulb, whatever its resistance.
  for (const resistance of [1, 10, 50, 100]) {
    near(`rated power is the same at R=${resistance}`, safePowerFor(), BULB_RATED_POWER, 0);
  }
}

/** One bulb, or two in the given wiring, at a voltage. */
function circuit(voltage: number, resistances: number[], wiring: 'series' | 'parallel' = 'series') {
  return resolveCircuit({
    voltage,
    switchClosed: true,
    bulbCount: resistances.length as 1 | 2,
    wiring,
    bulbs: resistances.map((resistance) => ({ resistance })),
    burnedOut: [false, false],
  });
}

{
  const under = circuit(10, [20]); // 5 W
  check('under the rated power: not overloaded', !under.bulbs[0].overloaded);
  const over = circuit(24, [20]); // 28.8 W
  check('over the rated power: overloaded', over.bulbs[0].overloaded);
}

{
  // Brightness must climb monotonically with power up to the overload point.
  let previous = -1;
  for (const voltage of [1, 4, 8, 11.9, 15]) {
    const r = circuit(voltage, [10]);
    check(`brightness rises with voltage (${voltage}V)`, r.bulbs[0].brightness > previous);
    previous = r.bulbs[0].brightness;
  }
  // P = V²/R = rating exactly at V = sqrt(rating · R).
  const vLimit = Math.sqrt(BULB_RATED_POWER * 10);
  const atLimit = circuit(vLimit, [10]);
  near('brightness reaches exactly 1 at the rated power', atLimit.bulbs[0].brightness, 1, 1e-9);
  check('...which is not yet an overload', !atLimit.bulbs[0].overloaded);
  check('just past it the bulb overloads', circuit(vLimit * 1.001, [10]).bulbs[0].overloaded);
  near('brightness is sqrt(P / rating)', circuit(9, [20]).bulbs[0].brightness, Math.sqrt(81 / 20 / BULB_RATED_POWER), 1e-12);
}

{
  // Audit: 10 Ω and 20 Ω in parallel at 12 V. The 10 Ω bulb draws twice the
  // current, so twice the power, and must look brighter — not both 100 %.
  const r = circuit(12, [10, 20], 'parallel');
  const [low, high] = r.bulbs;
  near('parallel: 10 Ω draws 1.2 A', low.current, 1.2, 1e-12);
  near('parallel: 20 Ω draws 0.6 A', high.current, 0.6, 1e-12);
  near('parallel: 10 Ω dissipates twice the power', low.power / high.power, 2, 1e-12);
  check(
    'parallel: the 10 Ω bulb is brighter',
    low.brightness > high.brightness,
    `${low.brightness} vs ${high.brightness}`
  );
  near('parallel: brightness ratio is sqrt(power ratio)', low.brightness / high.brightness, Math.SQRT2, 1e-12);
  check('parallel: neither saturates at 12 V', low.brightness < 0.9 && high.brightness < 0.9);
  check('parallel: neither burns out at 12 V', !low.overloaded && !high.overloaded);

  // Series is the reverse: same current, so the bigger resistance takes
  // more voltage and more power, and glows brighter.
  const s = circuit(12, [10, 20], 'series');
  check('series: the 20 Ω bulb is brighter', s.bulbs[1].brightness > s.bulbs[0].brightness);

  // Ordering by power always matches ordering by brightness.
  let consistent = true;
  for (const voltage of [1, 3, 6, 9, 12, 18, 24]) {
    for (const wiring of ['series', 'parallel'] as const) {
      for (const [ra, rb] of [[1, 2], [5, 50], [10, 20], [40, 100], [100, 100]]) {
        const c = circuit(voltage, [ra, rb], wiring);
        const [a, b] = c.bulbs;
        if (a.overloaded || b.overloaded) continue; // saturated at 1 — burning out
        if (Math.sign(a.power - b.power) !== Math.sign(a.brightness - b.brightness)) consistent = false;
      }
    }
  }
  check('more power always means more brightness', consistent);

  // Burnout stays consistent with the scale: a bulb overloads exactly when
  // its brightness would go past 1.
  let agree = true;
  for (const voltage of [2, 6, 12, 16, 20, 24]) {
    for (const resistance of [1, 5, 10, 20, 25, 50, 100]) {
      const b = circuit(voltage, [resistance]).bulbs[0];
      if (b.overloaded !== b.power > BULB_RATED_POWER) agree = false;
      if (!b.overloaded && b.brightness > 1) agree = false;
      if (b.overloaded && b.brightness !== 1) agree = false;
    }
  }
  check('overload happens exactly where brightness hits full', agree);
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


// ----------------------------------------------------------------- thermo --

const WATER = PRESET_SUBSTANCES.water;
const M = SUBSTANCE_MASS;

section('Thermodynamics — Q = m·c·ΔT within a phase');

{
  near('heatToWarm: 1 kg ice, 10 K', heatToWarm(1, WATER.cSolid, 10), 20_900, 1e-9);
  near('heatToWarm: scales with mass', heatToWarm(2, WATER.cLiquid, 5), 2 * 4186 * 5, 1e-9);
  near('heatToChangePhase: 1 kg melting water', heatToChangePhase(1, WATER.latentFusion), 334_000, 1e-9);

  // −20 °C ice, add the heat for +10 K: it should read −10 °C and still be solid.
  const h0 = enthalpyForTemperature(WATER, -20);
  const h1 = addHeat(WATER, h0, heatToWarm(M, WATER.cSolid, 10));
  const st = stateAt(WATER, h1);
  near('ice warms by exactly Q/(m·c)', st.temperature, -10, 1e-9);
  check('still solid after warming ice', st.phase === 'solid');

  // Liquid water: 4186 J raises 1 kg by 1 K.
  const hl = enthalpyForTemperature(WATER, 20);
  near('water warms 1 K for 4186 J', stateAt(WATER, addHeat(WATER, hl, 4186)).temperature, 21, 1e-9);
  check('20 °C is liquid', stateAt(WATER, hl).phase === 'liquid');

  // Steam.
  const hg = enthalpyForTemperature(WATER, 130);
  check('130 °C is gas', stateAt(WATER, hg).phase === 'gas');
  near('steam warms by Q/(m·c)', stateAt(WATER, addHeat(WATER, hg, 2010 * 5)).temperature, 135, 1e-9);
}

section('Thermodynamics — the plateaus (latent heat)');

{
  const th = thresholds(WATER);
  near('melting needs m·L_f', th.meltEnd - th.meltStart, 334_000, 1e-6);
  near('boiling needs m·L_v', th.boilEnd - th.boilStart, 2_260_000, 1e-6);

  // Temperature is flat the whole way through melting.
  let flatMelt = true;
  let flatBoil = true;
  for (let i = 1; i < 200; i++) {
    const m = stateAt(WATER, th.meltEnd * (i / 200));
    if (m.phase !== 'melting' || Math.abs(m.temperature - WATER.meltingPoint) > 1e-12) flatMelt = false;
    const b = stateAt(WATER, th.boilStart + (th.boilEnd - th.boilStart) * (i / 200));
    if (b.phase !== 'boiling' || Math.abs(b.temperature - WATER.boilingPoint) > 1e-12) flatBoil = false;
  }
  check('temperature stays at 0 °C throughout melting', flatMelt);
  check('temperature stays at 100 °C throughout boiling', flatBoil);

  near('half the latent heat → half melted', stateAt(WATER, th.meltEnd / 2).fraction, 0.5, 1e-12);
  near('a quarter of L_v → a quarter boiled', stateAt(WATER, th.boilStart + (th.boilEnd - th.boilStart) / 4).fraction, 0.25, 1e-12);

  // Only once the latent heat is paid does the temperature move again.
  const justAfterMelt = stateAt(WATER, th.meltEnd + 4186 * 0.5);
  check('liquid once melting is paid for', justAfterMelt.phase === 'liquid');
  near('...and then it warms', justAfterMelt.temperature, 0.5, 1e-9);
  const justAfterBoil = stateAt(WATER, th.boilEnd + 2010 * 2);
  check('gas once boiling is paid for', justAfterBoil.phase === 'gas');
  near('...and then steam warms', justAfterBoil.temperature, 102, 1e-9);

  check('latentHeatFor melting is L_f', latentHeatFor(WATER, 'melting') === WATER.latentFusion);
  check('latentHeatFor boiling is L_v', latentHeatFor(WATER, 'boiling') === WATER.latentVaporization);
  check('latentHeatFor liquid is null', latentHeatFor(WATER, 'liquid') === null);
  check('specificHeatFor liquid is c_l', specificHeatFor(WATER, 'liquid') === WATER.cLiquid);
  check('specificHeatFor melting is null', specificHeatFor(WATER, 'melting') === null);
}

section('Thermodynamics — energy bookkeeping');

{
  // −20 °C ice to 120 °C steam, summed by hand.
  const byHand =
    heatToWarm(M, WATER.cSolid, 20) +
    heatToChangePhase(M, WATER.latentFusion) +
    heatToWarm(M, WATER.cLiquid, 100) +
    heatToChangePhase(M, WATER.latentVaporization) +
    heatToWarm(M, WATER.cGas, 20);
  near('hand-summed total for water −20 → 120 °C', byHand, 3_094_600, 1e-6);
  near('heatBetween agrees with the hand sum', heatBetween(WATER, -20, 120), byHand, 1e-6);

  for (const id of PRESET_ORDER) {
    const sub = PRESET_SUBSTANCES[id];
    const lo = sub.meltingPoint - 30;
    const hi = sub.boilingPoint + 30;
    const hand =
      heatToWarm(M, sub.cSolid, 30) +
      heatToChangePhase(M, sub.latentFusion) +
      heatToWarm(M, sub.cLiquid, sub.boilingPoint - sub.meltingPoint) +
      heatToChangePhase(M, sub.latentVaporization) +
      heatToWarm(M, sub.cGas, 30);
    near(`${id}: heatBetween matches the hand sum`, heatBetween(sub, lo, hi), hand, Math.abs(hand) * 1e-9);
  }

  // Round trips: temperature → enthalpy → temperature.
  for (const id of PRESET_ORDER) {
    const sub = PRESET_SUBSTANCES[id];
    const temps = [sub.meltingPoint - 25, sub.meltingPoint - 1, (sub.meltingPoint + sub.boilingPoint) / 2, sub.boilingPoint + 1, sub.boilingPoint + 40];
    for (const T of temps) {
      near(`${id}: temperature round-trips at ${T.toFixed(1)} °C`, stateAt(sub, enthalpyForTemperature(sub, T)).temperature, T, 1e-7);
    }
  }

  // Heating then cooling by the same Q returns to the start.
  for (const id of PRESET_ORDER) {
    const sub = PRESET_SUBSTANCES[id];
    const start = enthalpyForTemperature(sub, sub.meltingPoint - 10);
    const Q = heatBetween(sub, sub.meltingPoint - 10, sub.boilingPoint + 10) * 0.7;
    const back = addHeat(sub, addHeat(sub, start, Q), -Q);
    near(`${id}: heat then cool by the same Q is reversible`, back, start, Math.abs(Q) * 1e-12);
  }

  // The time step must not matter.
  const hA = addHeat(WATER, enthalpyForTemperature(WATER, -20), 1_500_000);
  let hB = enthalpyForTemperature(WATER, -20);
  for (let i = 0; i < 1500; i++) hB = addHeat(WATER, hB, 1000);
  near('one big step equals 1500 small ones', hA, hB, 1e-4);
  near('...and gives the same temperature', stateAt(WATER, hA).temperature, stateAt(WATER, hB).temperature, 1e-9);
}

section('Thermodynamics — shape of the curve');

{
  for (const id of PRESET_ORDER) {
    const sub = PRESET_SUBSTANCES[id];
    const th = thresholds(sub);
    const lo = enthalpyForTemperature(sub, sub.meltingPoint - 40);
    const hi = enthalpyForTemperature(sub, sub.boilingPoint + 40);
    let prev = -Infinity;
    let monotonic = true;
    let finite = true;
    for (let i = 0; i <= 2000; i++) {
      const T = stateAt(sub, lo + (hi - lo) * (i / 2000)).temperature;
      if (!Number.isFinite(T)) finite = false;
      if (T < prev - 1e-9) monotonic = false;
      prev = T;
    }
    check(`${id}: temperature never falls as heat is added`, monotonic);
    check(`${id}: temperature always finite`, finite);

    // No jump at either end of a plateau.
    const eps = 1e-3;
    const a = stateAt(sub, th.meltEnd - eps).temperature;
    const b = stateAt(sub, th.meltEnd + eps).temperature;
    check(`${id}: no jump at the end of melting`, Math.abs(a - b) < 1e-4);
    const c = stateAt(sub, th.boilStart - eps).temperature;
    const d = stateAt(sub, th.boilStart + eps).temperature;
    check(`${id}: no jump at the start of boiling`, Math.abs(c - d) < 1e-4);
    check(`${id}: preset passes validation`, isValidSubstance(sub));
  }

  // Same heat, different substance, different result.
  const iron = PRESET_SUBSTANCES.iron;
  const hw = addHeat(WATER, enthalpyForTemperature(WATER, 20), 100_000);
  const hi = addHeat(iron, enthalpyForTemperature(iron, 20), 100_000);
  const dW = stateAt(WATER, hw).temperature - 20;
  const dI = stateAt(iron, hi).temperature - 20;
  near('100 kJ warms water by 100000/4186 K', dW, 100_000 / 4186, 1e-9);
  near('100 kJ warms iron by 100000/449 K', dI, 100_000 / 449, 1e-9);
  check('iron warms far more than water for the same heat', dI > dW * 5);

  // Starting exactly on a transition point.
  check('starting at the melting point is fully solid', stateAt(WATER, enthalpyForTemperature(WATER, 0)).phase === 'solid');
  check('starting at the boiling point is fully liquid', stateAt(WATER, enthalpyForTemperature(WATER, 100)).phase === 'liquid');

  // heatLevel is a clean 0..1 for the colour scale.
  const levels = [-300, -100, 0, 50, 100, 500].map((T) => heatLevel(WATER, T));
  check('heatLevel stays within [0,1]', levels.every((v) => v >= 0 && v <= 1));
  check('heatLevel rises with temperature', heatLevel(WATER, 100) > heatLevel(WATER, 0));
}

section('Thermodynamics — limits and custom substances');

{
  const floorH = addHeat(WATER, 0, -1e15);
  near('cooling stops at absolute zero', stateAt(WATER, floorH).temperature, ABSOLUTE_ZERO_C, 1e-9);
  check('atLimit reports cold', atLimit(WATER, floorH) === 'cold');
  const topH = addHeat(WATER, 0, 1e15);
  near('heating stops at the ceiling', stateAt(WATER, topH).temperature, MAX_TEMPERATURE_C, 1e-6);
  check('atLimit reports hot', atLimit(WATER, topH) === 'hot');
  check('atLimit is null in between', atLimit(WATER, 0) === null);

  const start = enthalpyForTemperature(WATER, ABSOLUTE_ZERO_C - 50);
  near('a starting temperature below absolute zero is clamped', stateAt(WATER, start).temperature, ABSOLUTE_ZERO_C, 1e-9);

  check('the custom default is valid', isValidSubstance(CUSTOM_DEFAULT));
  const bad = (patch: Partial<Substance>) => isValidSubstance({ ...CUSTOM_DEFAULT, ...patch });
  check('melting point at/above boiling point is rejected', !bad({ meltingPoint: 200 }) && !bad({ meltingPoint: 300 }));
  check('zero or negative specific heat is rejected', !bad({ cSolid: 0 }) && !bad({ cGas: -5 }));
  check('zero latent heat is rejected', !bad({ latentFusion: 0 }) && !bad({ latentVaporization: -1 }));
  check('NaN is rejected', !bad({ cLiquid: NaN }) && !bad({ boilingPoint: NaN }));
  check('below absolute zero is rejected', !bad({ meltingPoint: -300, boilingPoint: -280 }));
}

section('Thermodynamics — boundary values');

{
  const extremes = [0, 1, -1, 1e-9, 1e9, -1e9, Number.MAX_SAFE_INTEGER];
  let allFinite = true;
  for (const id of PRESET_ORDER) {
    const sub = PRESET_SUBSTANCES[id];
    for (const q of extremes) {
      const st = stateAt(sub, addHeat(sub, enthalpyForTemperature(sub, sub.meltingPoint), q));
      if (!Number.isFinite(st.temperature) || st.fraction < 0 || st.fraction > 1) allFinite = false;
    }
  }
  check('extreme heat inputs never give NaN, Infinity or a fraction outside 0..1', allFinite);
}

// ------------------------------------------------------- particle engine --

section('Particle engine — the picture follows the state');

{
  const water = PRESET_SUBSTANCES.water;
  const frame = (engine: MatterEngine, input: EngineInput, seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) engine.step(1 / 60, input, water);
  };
  const make = (input: EngineInput) => {
    const e = new MatterEngine(3);
    e.resize(420, 300);
    e.settle(input);
    return e;
  };
  const solid: EngineInput = { phase: 'solid', fraction: 0, temperature: -10, heatRate: 20000, running: true };
  const liquid: EngineInput = { phase: 'liquid', fraction: 1, temperature: 50, heatRate: 20000, running: true };
  const gas: EngineInput = { phase: 'gas', fraction: 1, temperature: 130, heatRate: 20000, running: true };

  const es = make(solid);
  const el = make(liquid);
  const eg = make(gas);
  frame(es, solid, 3);
  frame(el, liquid, 3);
  frame(eg, gas, 3);

  const inside = (e: MatterEngine) =>
    e.particles.every(
      (p) =>
        Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.vx) && Number.isFinite(p.vy) &&
        p.x >= e.bounds.left && p.x <= e.bounds.right && p.y >= e.bounds.top && p.y <= e.bounds.bottom
    );
  check('solid: particles finite and inside the box', inside(es));
  check('liquid: particles finite and inside the box', inside(el));
  check('gas: particles finite and inside the box', inside(eg));
  check('there are the expected number of particles', es.particles.length === PARTICLE_COUNT);

  const maxDrift = Math.max(...es.particles.map((p) => Math.hypot(p.x - p.homeX, p.y - p.homeY)));
  check('solid: every particle stays near its lattice site', maxDrift < es.spacing * 0.6, `max drift ${maxDrift.toFixed(2)} vs spacing ${es.spacing.toFixed(2)}`);
  check('solid: all particles are in the lattice', es.modeShares().lattice === 1);
  check('liquid: all particles are free but not gas', el.modeShares().liquid === 1);
  check('gas: all particles are gas', eg.modeShares().gas === 1);

  const vs = es.meanSpeed();
  const vl = el.meanSpeed();
  const vg = eg.meanSpeed();
  check('speed order: solid < liquid < gas', vs < vl && vl < vg, `${vs.toFixed(0)} / ${vl.toFixed(0)} / ${vg.toFixed(0)}`);

}

{
  const water = PRESET_SUBSTANCES.water;
  const make = (input: EngineInput) => {
    const e = new MatterEngine(5);
    e.resize(420, 300);
    e.settle(input);
    return e;
  };
  const run = (e: MatterEngine, input: EngineInput, seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) e.step(1 / 60, input, water);
  };

  const meanY = (e: MatterEngine) => e.particles.reduce((a, p) => a + p.y, 0) / e.particles.length;
  const gasInput: EngineInput = { phase: 'gas', fraction: 1, temperature: 130, heatRate: 1, running: true };
  const liquidInput: EngineInput = { phase: 'liquid', fraction: 1, temperature: 50, heatRate: 1, running: true };
  const eg = make(gasInput);
  const el = make(liquidInput);
  run(eg, gasInput, 4);
  run(el, liquidInput, 4);
  const centre = (eg.bounds.top + eg.bounds.bottom) / 2;
  check('liquid sits low in the box', meanY(el) > centre, `${meanY(el).toFixed(0)} vs centre ${centre.toFixed(0)}`);
  check('gas fills the box (mean height near the middle)', Math.abs(meanY(eg) - centre) < (eg.bounds.bottom - eg.bounds.top) * 0.2, `${meanY(eg).toFixed(0)} vs centre ${centre.toFixed(0)}`);
  check('liquid has a surface above the floor', el.surfaceY < el.bounds.bottom - el.radius);

  // Halfway through melting, about half the lattice has let go.
  const melting: EngineInput = { phase: 'melting', fraction: 0.5, temperature: 0, heatRate: 20000, running: true };
  const em = make(melting);
  const shares = em.modeShares();
  check('halfway through melting, about half the particles are still in the lattice', Math.abs(shares.lattice - 0.5) < 0.05, `lattice share ${shares.lattice.toFixed(2)}`);

  // Halfway through boiling, about half have left as gas.
  const boiling: EngineInput = { phase: 'boiling', fraction: 0.5, temperature: 100, heatRate: 20000, running: true };
  const eb = make(boiling);
  check('halfway through boiling, about half the particles are gas', Math.abs(eb.modeShares().gas - 0.5) < 0.05);
  run(eb, boiling, 3);
  check('boiling makes steam', eb.wisps.length > 0);
  check('boiling makes bubbles or has released them at the surface', eb.bubbles.length > 0 || eb.wisps.length > 0);
  check('particles stay finite and inside the box while boiling', eb.particles.every((p) => Number.isFinite(p.x + p.y) && p.x >= eb.bounds.left && p.x <= eb.bounds.right && p.y >= eb.bounds.top && p.y <= eb.bounds.bottom));

  // Freezing: lattice grows back, with crystal flashes.
  const freezing: EngineInput = { phase: 'melting', fraction: 0.5, temperature: 0, heatRate: -20000, running: true };
  const ef = make({ ...freezing, fraction: 1, phase: 'liquid' });
  run(ef, { phase: 'liquid', fraction: 1, temperature: 5, heatRate: -20000, running: true }, 1);
  let sparkled = false;
  for (let i = 0; i <= 100; i++) {
    const f = Math.max(0, 1 - i / 100);
    const input: EngineInput = { phase: f > 0 ? 'melting' : 'solid', fraction: f, temperature: 0, heatRate: -20000, running: true };
    for (let k = 0; k < 6; k++) ef.step(1 / 60, input, water);
    if (ef.sparkles.length > 0) sparkled = true;
  }
  check('freezing produces crystal sparkles', sparkled);
  check('after freezing, the particles are back in the lattice', ef.modeShares().lattice === 1);

  // No instant swap: the first frame of melting moves nobody far.
  const e0 = make({ phase: 'solid', fraction: 0, temperature: 0, heatRate: 1, running: true });
  const before = e0.particles.map((p) => ({ x: p.x, y: p.y }));
  e0.step(1 / 60, { phase: 'melting', fraction: 1, temperature: 0, heatRate: 1, running: true }, water);
  const maxJump = Math.max(...e0.particles.map((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y)));
  check('a change of state does not teleport particles', maxJump < e0.spacing * 0.5, `max jump ${maxJump.toFixed(2)}`);

  // Resizing mid-run keeps everything finite and inside.
  eg.resize(300, 220);
  run(eg, gasInput, 1);
  check('resizing keeps particles inside the new box', eg.particles.every((p) => Number.isFinite(p.x + p.y) && p.x >= eg.bounds.left - 0.01 && p.x <= eg.bounds.right + 0.01 && p.y >= eg.bounds.top - 0.01 && p.y <= eg.bounds.bottom + 0.01));
}

// ----------------------------------------------------------- simple machines --

section('Simple machines: the lever');

{
  const g = EARTH_G;
  // 20 kg load, pivot 1 m from it on a 4 m plank: the effort arm is 3 m.
  const r = leverAnalysis({ loadMass: 20, loadArm: 1, effort: 100 });
  near('lever: load force is m·g', r.loadForce, 20 * g, 1e-12);
  near('lever: effort arm is length − load arm', r.effortArm, 3, 1e-12);
  near('lever: MA = effort arm / load arm', r.mechanicalAdvantage, 3, 1e-12);
  near('lever: required effort = load × load arm / effort arm', r.effortRequired, (20 * g) / 3, 1e-12);
  near('lever: effort × effort arm = load × load arm at the required effort', r.effortRequired * r.effortArm, r.loadForce * r.loadArm, 1e-9);
  near('lever: effort required = load / MA', r.effortRequired, r.loadForce / r.mechanicalAdvantage, 1e-12);
  check('lever: 100 N is enough to lift 20 kg at 3:1', r.enough);
  check('lever: 60 N is not enough to lift 20 kg at 3:1', !leverAnalysis({ loadMass: 20, loadArm: 1, effort: 60 }).enough);
  check('lever: exactly the required effort counts as enough', leverAnalysis({ loadMass: 20, loadArm: 1, effort: (20 * g) / 3 }).enough);
  near('lever: load torque is load × load arm', r.loadTorque, 20 * g * 1, 1e-12);
  near('lever: effort torque is effort × effort arm', r.effortTorque, 100 * 3, 1e-12);

  // A centred pivot is a seesaw: no advantage at all.
  const level = leverAnalysis({ loadMass: 10, loadArm: 2, effort: 0 });
  near('lever: a centred pivot has MA 1', level.mechanicalAdvantage, 1, 1e-12);
  near('lever: ...and needs the full weight', level.effortRequired, 10 * g, 1e-12);

  // Pivot nearer the effort end makes it harder than lifting by hand.
  const hard = leverAnalysis({ loadMass: 10, loadArm: 3, effort: 0 });
  check('lever: pivot nearer the effort end gives MA < 1', hard.mechanicalAdvantage < 1);
  check('lever: ...and needs more than the weight', hard.effortRequired > hard.loadForce);

  // Moving the pivot toward the load always reduces the effort.
  const far = leverAnalysis({ loadMass: 20, loadArm: 2, effort: 0 }).effortRequired;
  const close = leverAnalysis({ loadMass: 20, loadArm: 0.5, effort: 0 }).effortRequired;
  check('lever: pivot closer to the load needs less effort', close < far);
}

{
  const geo = leverGeometry(1, 3);
  near('lever geometry: pivot height puts the load end on the ground at rest', geo.pivotHeight - 1 * Math.sin(geo.restAngle), 0, 1e-12);
  near('lever geometry: effort travels MA × as far as the load (vertical)', geo.effortDrop / geo.loadRise, 3, 1e-9);
  check('lever geometry: the swing stops at or before 30°', geo.maxAngle <= (30 * Math.PI) / 180 + 1e-12);
  near('lever angle: progress 0 is the rest angle, load end low', leverAngle(geo, 0), -geo.restAngle, 1e-9);
  near('lever angle: progress 1 is the top of the swing', leverAngle(geo, 1), geo.maxAngle, 1e-9);
  near('lever angle: the load rises evenly with progress', 1 * (Math.sin(leverAngle(geo, 0.5)) + Math.sin(geo.restAngle)), geo.loadRise / 2, 1e-9);
  check('lever angle: clamps beyond the ends', leverAngle(geo, -1) === leverAngle(geo, 0) && leverAngle(geo, 2) === leverAngle(geo, 1));

  // Pivot far from the load: the effort end would pass the stop, so the swing is capped.
  const steep = leverGeometry(3.6, 0.4);
  near('lever geometry: the swing is capped at 30°', steep.maxAngle, (30 * Math.PI) / 180, 1e-12);

  const w = leverWork({ loadMass: 20, loadArm: 1, effort: 0 });
  near('lever work: input = output at the required effort', w.input, w.output, 1e-9);
  near('lever work: input distance = MA × load distance', w.effortDistance, 3 * w.loadDistance, 1e-9);
  const odd = leverWork({ loadMass: 7.3, loadArm: 2.6, effort: 0 });
  near('lever work: input = output for another pivot', odd.input, odd.output, 1e-9);
}

section('Simple machines: the inclined plane');

{
  const g = EARTH_G;
  const r = inclineAnalysis({ loadMass: 20, length: 5, height: 1, effort: 60 });
  near('ramp: load force is m·g', r.loadForce, 20 * g, 1e-12);
  near('ramp: effort = weight × height / length', r.effortRequired, (20 * g * 1) / 5, 1e-12);
  near('ramp: MA = length / height', r.mechanicalAdvantage, 5, 1e-12);
  near('ramp: straight lift needs the full weight', r.liftForce, 20 * g, 1e-12);
  near('ramp: effort = weight × sin(angle)', r.effortRequired, r.loadForce * Math.sin(r.angle), 1e-9);
  near('ramp: sin(angle) = height / length', Math.sin(r.angle), 0.2, 1e-12);
  check('ramp: 60 N pushes a 20 kg box up a 1:5 ramp', r.enough);
  check('ramp: ...but cannot lift it straight up', !r.canLiftStraight);
  check('ramp: 30 N is not enough on that ramp', !inclineAnalysis({ loadMass: 20, length: 5, height: 1, effort: 30 }).enough);
  check('ramp: a push of its full weight can lift it straight up', inclineAnalysis({ loadMass: 20, length: 5, height: 1, effort: 20 * g }).canLiftStraight);
  check('ramp: a longer ramp needs less effort', inclineAnalysis({ loadMass: 20, length: 8, height: 1, effort: 0 }).effortRequired < r.effortRequired);
  check('ramp: a taller ramp needs more effort', inclineAnalysis({ loadMass: 20, length: 5, height: 2, effort: 0 }).effortRequired > r.effortRequired);
  near('ramp: effort × length = weight × height', r.effortRequired * 5, r.loadForce * 1, 1e-9);

  const w = inclineWork({ loadMass: 20, length: 5, height: 1, effort: 0 });
  near('ramp work: input = output', w.input, w.output, 1e-9);
  near('ramp work: input distance is the ramp length', w.effortDistance, 5, 1e-12);
  near('ramp work: output distance is the height', w.loadDistance, 1, 1e-12);

  near('ramp: steepest allowed at length 1 is 0.9', maxRampHeight(1), 0.9, 1e-12);
  near('ramp: height is capped at 3 on long ramps', maxRampHeight(10), 3, 1e-12);
  check('ramp: the steepest allowed ramp is still below vertical', Math.asin(maxRampHeight(1) / 1) < Math.PI / 2);
}

section('Simple machines: the pulley');

{
  const g = EARTH_G;
  const one = pulleyAnalysis({ loadMass: 20, pulleys: 1, effort: 0 });
  near('pulley: one pulley has MA 1', one.mechanicalAdvantage, 1, 1e-12);
  near('pulley: one pulley needs the full weight', one.effortRequired, 20 * g, 1e-12);
  const four = pulleyAnalysis({ loadMass: 20, pulleys: 4, effort: 0 });
  near('pulley: MA = supporting segments', four.mechanicalAdvantage, four.segments, 1e-12);
  near('pulley: effort = weight / MA', four.effortRequired, (20 * g) / 4, 1e-12);
  check('pulley: 100 N lifts 20 kg with two pulleys', pulleyAnalysis({ loadMass: 20, pulleys: 2, effort: 100 }).enough);
  check('pulley: 100 N does not lift 20 kg with one pulley', !pulleyAnalysis({ loadMass: 20, pulleys: 1, effort: 100 }).enough);
  check('pulley: counts are whole numbers', pulleyAnalysis({ loadMass: 20, pulleys: 2.6, effort: 0 }).segments === 3);
  check('pulley: never fewer than one segment', pulleyAnalysis({ loadMass: 20, pulleys: 0, effort: 0 }).segments === 1);

  let monotone = true;
  for (let n = 1; n < 6; n++) {
    const a = pulleyAnalysis({ loadMass: 20, pulleys: n, effort: 0 }).effortRequired;
    const b = pulleyAnalysis({ loadMass: 20, pulleys: n + 1, effort: 0 }).effortRequired;
    if (!(b < a)) monotone = false;
  }
  check('pulley: every added pulley lowers the effort', monotone);

  for (const n of [1, 2, 3, 4, 5, 6]) {
    const w = pulleyWork({ loadMass: 20, pulleys: n, effort: 0 });
    near(`pulley work: input = output with ${n} pulley${n > 1 ? 's' : ''}`, w.input, w.output, 1e-9);
    near(`pulley work: rope pulled = ${n} × the rise`, w.effortDistance, n * w.loadDistance, 1e-12);
  }
  near('pulley work: the default rise is the full travel', pulleyWork({ loadMass: 1, pulleys: 1, effort: 0 }).loadDistance, PULLEY_TRAVEL, 1e-12);
  near('pulley work: a custom rise', pulleyWork({ loadMass: 10, pulleys: 2, effort: 0 }, 0.5).loadDistance, 0.5, 1e-12);

  // The drawing's rope layout must agree with the physics.
  for (let n = 1; n <= MACHINE_LIMITS.pulleysMax; n++) {
    const layout = pulleyLayout(n);
    check(`pulley layout: ${n} pulleys hold the load with ${n} segments`, supportingSegments(layout) === n);
    check(`pulley layout: ${n} pulleys split into fixed + moving`, layout.fixedCount + layout.movingCount === n);
    check(`pulley layout: ${n} pulleys end on a fixed pulley (pull down)`, layout.fixed[n - 1] === true);
  }
  check('pulley layout: one pulley is a single fixed pulley', pulleyLayout(1).fixedCount === 1 && pulleyLayout(1).movingCount === 0);
  check('pulley layout: two pulleys are one fixed, one moving', pulleyLayout(2).fixedCount === 1 && pulleyLayout(2).movingCount === 1);
}

section('Simple machines: helpers');

{
  near('work = force × distance', work(50, 2), 100, 1e-12);
  near('weight of 10 kg', weightOf(10), 10 * EARTH_G, 1e-12);
  near('effort ratio of exactly enough is 1', effortRatio(40, 40), 1, 1e-12);
  check('effort ratio with nothing required is infinite', effortRatio(10, 0) === Infinity);
  check('round-up effort is never below the requirement', roundUpEffort(65.4306) >= 65.4306 && roundUpEffort(65.4306) - 65.4306 < 0.1);
  near('round-up effort leaves an exact tenth alone', roundUpEffort(65.4), 65.4, 1e-12);
  check('round-up effort is always enough', isEnough(roundUpEffort(195.84), 195.84));
}

section('Simple machines: the load in motion');

{
  const lane = (over: Partial<Lane> = {}): Lane => ({
    running: true,
    enough: true,
    ratio: 1.5,
    handTravel: 5,
    pathLength: 5,
    fallAccel: EARTH_G,
    ...over,
  });
  const DT = 1 / 60;
  const run = (m: Motion, l: Lane, seconds: number) => {
    let motion = m;
    const events: string[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      const r = stepMotion(motion, l, DT);
      motion = r.motion;
      if (r.event) events.push(r.event.type);
    }
    return { motion, events };
  };

  near('lift time: a long ramp takes hand-travel / pace', liftDuration(8), 8 / HAND_PACE, 1e-12);
  near('lift time: a tiny machine still takes a watchable moment', liftDuration(0.1), MIN_LIFT_TIME, 1e-12);
  near('lift time: a huge machine is capped', liftDuration(1000), MAX_LIFT_TIME, 1e-12);
  check('lift time: more hand travel takes longer', liftDuration(6) > liftDuration(2));

  const lifted = run(START, lane(), 20);
  check('motion: with enough effort the load reaches the top', lifted.motion.progress === 1);
  check('motion: ...and reports it exactly once', lifted.events.filter((e) => e === 'top').length === 1);
  near('motion: it comes to rest at the top', lifted.motion.velocity, 0, 1e-12);

  const early = run(START, lane({ handTravel: 4.8 }), 1);
  check('motion: it has not arrived after one second of a 3 s lift', early.motion.progress > 0 && early.motion.progress < 0.5);

  const quick = run(START, lane({ handTravel: 1.6 }), 4);
  const slow = run(START, lane({ handTravel: 9.6 }), 4);
  check('motion: less hand travel arrives sooner', quick.motion.progress === 1 && slow.motion.progress < 1);

  const blocked = run(START, lane({ enough: false, ratio: 0.5 }), 3);
  check('motion: too little effort leaves the load where it is', blocked.motion.progress === 0 && blocked.events.length === 0);

  const held = run({ progress: 0.4, velocity: 0.2 }, lane({ running: false }), 2);
  check('motion: paused, the load is held in place', held.motion.progress === 0.4 && held.motion.velocity === 0);

  // Let go halfway up: it should fall back and land with a thud.
  const falling = run({ progress: 0.6, velocity: 0 }, lane({ enough: false, ratio: 0.2 }), 6);
  check('motion: too little effort lets a raised load fall back', falling.motion.progress === 0);
  check('motion: ...and it lands with a thud', falling.events.includes('thud'));

  // Pushing nearly hard enough barely lets it fall.
  const barely = run({ progress: 0.5, velocity: 0 }, lane({ enough: false, ratio: 0.99 }), 1);
  check('motion: nearly enough effort lets it fall only slowly', barely.motion.progress > 0.45);
  const heavy = run({ progress: 0.5, velocity: 0 }, lane({ enough: false, ratio: 0.05 }), 1);
  check('motion: far too little effort lets it fall faster', heavy.motion.progress < barely.motion.progress);

  let stayedInRange = true;
  let m: Motion = START;
  for (let i = 0; i < 2000; i++) {
    const enough = Math.floor(i / 150) % 2 === 0;
    const r = stepMotion(m, lane({ enough, ratio: enough ? 1.4 : 0.1 }), DT);
    m = r.motion;
    if (!(m.progress >= 0 && m.progress <= 1 && Number.isFinite(m.velocity))) stayedInRange = false;
  }
  check('motion: progress stays within 0..1 however the effort changes', stayedInRange);
  check(
    'motion: the fall is never faster than the speed limit',
    Math.abs(run({ progress: 1, velocity: 0 }, lane({ enough: false, ratio: 0 }), 0.5).motion.velocity) * 5 <= MAX_FALL_SPEED + 1e-9
  );

  near('load speed is progress rate × path length', loadSpeed({ progress: 0.3, velocity: 0.2 }, 5), 1, 1e-12);

  check('status: not started is idle', motionStatus(START, { running: false, enough: true }, false) === 'idle');
  check('status: pushing hard enough is lifting', motionStatus({ progress: 0.3, velocity: 0.2 }, { running: true, enough: true }, true) === 'lifting');
  check('status: pushing too weakly at the bottom is blocked', motionStatus(START, { running: true, enough: false }, true) === 'blocked');
  check('status: a raised load with too little effort is falling', motionStatus({ progress: 0.3, velocity: 0 }, { running: true, enough: false }, true) === 'falling');
  check('status: at the top it is done', motionStatus({ progress: 1, velocity: 0 }, { running: false, enough: true }, true) === 'done');
  check('status: stopped part way is paused', motionStatus({ progress: 0.3, velocity: 0 }, { running: false, enough: true }, true) === 'paused');
}

// -------------------------------------------------------------------- waves --

section('Waves: wavelength, period and the wave relation');

{
  near('λ = v/f: 440 Hz in air', wavelength(343, 440), 0.77954545, 1e-6);
  near('λ = v/f: 100 Hz in water', wavelength(1480, 100), 14.8, 1e-9);
  near('λ = v/f: 4000 Hz in steel', wavelength(5960, 4000), 1.49, 1e-9);
  near('doubling the frequency halves the wavelength', wavelength(343, 880), wavelength(343, 440) / 2, 1e-12);
  check('zero frequency has no finite wavelength', wavelength(343, 0) === Infinity);
  check('negative frequency has no finite wavelength', wavelength(343, -5) === Infinity);

  near('T = 1/f at 440 Hz', period(440), 1 / 440, 1e-15);
  near('T = 1/f at 20 Hz', period(20), 0.05, 1e-15);
  check('zero frequency has no finite period', period(0) === Infinity);

  for (const id of MATERIAL_ORDER) {
    const v = MATERIALS[id].speed;
    for (const f of [WAVE_LIMITS.frequencyMin, 440, WAVE_LIMITS.frequencyMax]) {
      near(`v = f·λ holds in ${id} at ${f} Hz`, f * wavelength(v, f), v, 1e-9);
      near(`λ = v·T in ${id} at ${f} Hz`, v * period(f), wavelength(v, f), 1e-9);
    }
  }

  near('air speed is the textbook value', MATERIALS.air.speed, 343, 0);
  near('water speed is the textbook value', MATERIALS.water.speed, 1480, 0);
  near('steel speed is the textbook value', MATERIALS.steel.speed, 5960, 0);
  check('same pitch: water stretches the wave compared with air', wavelength(1480, 440) > wavelength(343, 440));
  check('same pitch: steel stretches it further still', wavelength(5960, 440) > wavelength(1480, 440));
}

section('Waves: displacement');

{
  const wave = { amplitude: 50, frequency: 440, lambda: wavelength(343, 440) };
  near('y(0, 0) = 0', displacement(0, 0, wave), 0, 1e-12);
  near('y = A a quarter wave along', displacement(wave.lambda / 4, 0, wave), 50, 1e-9);
  near('y = −A three quarters of a wave along', displacement((3 * wave.lambda) / 4, 0, wave), -50, 1e-9);
  near('repeats after one wavelength', displacement(0.1 + wave.lambda, 0.002, wave), displacement(0.1, 0.002, wave), 1e-9);
  near('repeats after one period', displacement(0.1, 0.002 + period(440), wave), displacement(0.1, 0.002, wave), 1e-9);
  // A crest at x at time t is at x + v·dt a moment later: the wave moves towards +x.
  const dt = 0.0003;
  near(
    'the wave moves towards +x at speed v',
    displacement(0.2 + 343 * dt, 0.001 + dt, wave),
    displacement(0.2, 0.001, wave),
    1e-9
  );
  near(
    'the phase form matches y(x, t)',
    displacementAtPhase(0.3, 50, wave.lambda, wave.frequency * 0.004),
    displacement(0.3, 0.004, wave),
    1e-12
  );
  for (const t of [0, 0.001, 0.0123]) {
    for (const x of [0, 0.1, 0.777]) {
      check(`|y| never exceeds A (x=${x}, t=${t})`, Math.abs(displacement(x, t, wave)) <= 50 + 1e-9);
    }
  }
}

section('Waves: superposition');

{
  near('y = y1 + y2', superpose(3, -1), 2, 1e-12);
  const lambda = wavelength(343, 440);
  const a = { amplitude: 40, frequency: 440, lambda };
  const opposite = (x: number) => displacementAtPhase(x, 40, lambda, 0.5);
  near('equal waves in step double', superpose(displacement(lambda / 4, 0, a), displacement(lambda / 4, 0, a)), 80, 1e-9);
  near('equal waves half a cycle apart cancel', superpose(displacement(0.1, 0, a), opposite(0.1)), 0, 1e-9);
}

section('Waves: beats');

{
  near('f_beat = |f1 − f2|', beatFrequency(440, 444), 4, 1e-12);
  near('the order of the two waves does not matter', beatFrequency(444, 440), 4, 1e-12);
  near('identical frequencies do not beat', beatFrequency(440, 440), 0, 0);

  near('outline is A1 + A2 when in step', beatEnvelope(60, 40, 4, 0), 100, 1e-9);
  near('outline is |A1 − A2| half a beat later', beatEnvelope(60, 40, 4, 0.125), 20, 1e-9);
  near('outline repeats after one beat', beatEnvelope(60, 40, 4, 0.25), 100, 1e-9);
  near('equal amplitudes cancel fully at the quiet point', beatEnvelope(50, 50, 4, 0.125), 0, 1e-6);
  near('no beat: the outline stays at its largest', beatEnvelope(60, 40, 0, 7.3), 100, 1e-9);

  // The real sum of the two sines must fit inside that outline, at every moment.
  const f1 = 440;
  const f2 = 444;
  let inside = true;
  let top = 0;
  for (let i = 0; i < 20000; i++) {
    const t = i / 40000;
    const sum = 60 * Math.sin(2 * Math.PI * f1 * t) + 40 * Math.sin(2 * Math.PI * f2 * t);
    if (Math.abs(sum) > beatEnvelope(60, 40, beatFrequency(f1, f2), t) + 1e-6) inside = false;
    top = Math.max(top, Math.abs(sum));
  }
  check('the sum of the two sines stays inside the outline', inside);
  near('the sum really reaches A1 + A2', top, 100, 0.1);

  check('a slow difference is a wobble', beatBand(4) === 'wobble');
  check('a faster one is a flutter', beatBand(20) === 'flutter');
  check('a large one sounds like two notes', beatBand(100) === 'separate');
  check('no difference is no beat', beatBand(0) === 'none');
}

section('Waves: sound safety');

{
  near('full amplitude is the capped gain', gainForAmplitude(100), MAX_WAVE_GAIN, 1e-12);
  near('half amplitude is half the gain', gainForAmplitude(50), MAX_WAVE_GAIN / 2, 1e-12);
  near('gain is capped above the range', gainForAmplitude(1e9), MAX_WAVE_GAIN, 1e-12);
  near('gain never goes negative', gainForAmplitude(-5), 0, 0);
  near('a non-number gives silence', gainForAmplitude(Number.NaN), 0, 0);

  const single = audioMix({ frequency: 440, amplitude: 100 }, null);
  near('one wave plays at its frequency', single.f1, 440, 0);
  near('with no second wave its gain is zero', single.g2, 0, 0);

  const pair = audioMix({ frequency: 440, amplitude: 100 }, { frequency: 444, amplitude: 100 });
  near('two waves keep the first frequency', pair.f1, 440, 0);
  near('two waves keep the second frequency', pair.f2, 444, 0);
  check('two waves at full size stay at or under a quarter of full scale', pair.g1 + pair.g2 <= 0.25);

  const same = audioMix({ frequency: 440, amplitude: 60 }, { frequency: 440, amplitude: 40 });
  near('identical frequencies play as one, at the sum', same.g1, gainForAmplitude(100), 1e-12);
  near('...with the other oscillator silent', same.g2, 0, 0);
}

section('Waves: the slowed-down picture');

{
  let previous = 0;
  for (const f of [20, 50, 100, 440, 880, 2000, 4000]) {
    const rate = displayRate(f);
    check(`more wiggles in the sound means more on screen (${f} Hz)`, rate > previous);
    check(`the picture is slower than the sound (${f} Hz)`, timeScale(f) < 1);
    check(`the picture stays watchable (${f} Hz)`, rate >= 0.3 && rate <= 3);
    near(`picture rate = frequency × slowdown (${f} Hz)`, f * timeScale(f), rate, 1e-9);
    previous = rate;
  }
  check('the stated slowdown is close to the real one', Math.abs(slowdownFactor(440) * timeScale(440) - 1) < 0.05);
  near('zero frequency does not move', displayRate(0), 0, 0);

  near('niceCeil rounds up', niceCeil(4.68), 5, 1e-9);
  near('niceCeil leaves a round value alone', niceCeil(2), 2, 1e-9);
  near('niceCeil crosses a decade', niceCeil(6), 10, 1e-9);
  near('niceFloor rounds down', niceFloor(4.68), 2, 1e-9);
  near('niceFloor leaves a round value alone', niceFloor(5), 5, 1e-9);

  const view = (material: keyof typeof MATERIALS, f1: number, f2: number | null = null, maxCycles = 100) =>
    viewWidth({ speed: MATERIALS[material].speed, f1, f2, maxCycles });

  near('air to water keeps the same view at 440 Hz', view('water', 440), view('air', 440), 0);
  near(
    '...so the drawn wave stretches by the true ratio',
    view('air', 440) / wavelength(343, 440) / (view('water', 440) / wavelength(1480, 440)),
    1480 / 343,
    1e-9
  );
  near('440 to 880 Hz keeps the same view in air', view('air', 880), view('air', 440), 0);

  for (const id of MATERIAL_ORDER) {
    for (const f of [20, 37, 100, 440, 1000, 2500, 4000]) {
      check(`one full wave fits on screen (${id}, ${f} Hz)`, wavelength(MATERIALS[id].speed, f) < view(id, f));
    }
  }
  near('a second wave of the same frequency changes nothing', view('air', 440, 440), view('air', 440), 0);
  check('a second wave zooms out to hold one full beat', view('air', 440, 450) >= wavelength(343, 10));
  const packed = view('air', 440, 441, 60);
  check('...but never packs the waves too tightly to see', packed / wavelength(343, 441) <= 60 + 1e-9);
  check('...and never hides a whole wave', wavelength(343, 440) < packed);
}

section('Waves: words');

{
  check('low pitch', pitchBand(100) === 'low');
  check('middle pitch', pitchBand(440) === 'middle');
  check('high pitch', pitchBand(2000) === 'high');
  check('quiet', loudnessBand(10) === 'quiet');
  check('medium', loudnessBand(50) === 'medium');
  check('loud', loudnessBand(90) === 'loud');
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
