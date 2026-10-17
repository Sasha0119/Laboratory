/**
 * Everything the Simple Machines page needs to know about one machine, worked
 * out from what the user typed.
 *
 * This is the glue between the formulas in `lib/physics/machines` and the
 * motion in `./motion`: one function per machine returns the same shape, so the
 * page can show and animate all three the same way. No display text here.
 */

import {
  GRAVITY,
  MACHINE_LIMITS,
  PULLEY_TRAVEL,
  effortRatio,
  inclineAnalysis,
  inclineWork,
  leverAnalysis,
  leverGeometry,
  leverWork,
  maxRampHeight,
  pulleyAnalysis,
  pulleyWork,
  type InclineResult,
  type LeverGeometry,
  type LeverResult,
  type MachineId,
  type PulleyResult,
  type WorkResult,
} from '../physics/machines';
import type { Lane } from './motion';

/** One thing that moves. The ramp has a second, for the box lifted straight up. */
export type LaneInput = Omit<Lane, 'running'>;

export interface LeverState {
  mass: number;
  /** Distance from the load to the pivot, m. */
  pivot: number;
  effort: number;
}

export interface InclineState {
  mass: number;
  length: number;
  height: number;
  effort: number;
}

export interface PulleyState {
  mass: number;
  pulleys: number;
  effort: number;
}

export interface MachineStates {
  lever: LeverState;
  incline: InclineState;
  pulley: PulleyState;
}

interface Common {
  loadMass: number;
  /** The weight of the load, N. */
  loadForce: number;
  /** The least effort that works, N. */
  required: number;
  effort: number;
  effortMax: number;
  enough: boolean;
  mechanicalAdvantage: number;
  /** Over one full lift. */
  work: WorkResult;
  lanes: LaneInput[];
}

export type MachineModel = Common &
  (
    | { mode: 'lever'; analysis: LeverResult; geometry: LeverGeometry }
    | { mode: 'incline'; analysis: InclineResult; length: number; height: number }
    | { mode: 'pulley'; analysis: PulleyResult; pulleys: number }
  );

/** The effort a mode lets the user type. */
export function effortMaxFor(mode: MachineId): number {
  return mode === 'lever'
    ? MACHINE_LIMITS.effortMaxLever
    : mode === 'incline'
      ? MACHINE_LIMITS.effortMaxIncline
      : MACHINE_LIMITS.effortMaxPulley;
}

export function leverModel(s: LeverState): MachineModel {
  const input = { loadMass: s.mass, loadArm: s.pivot, effort: s.effort };
  const analysis = leverAnalysis(input);
  const geometry = leverGeometry(analysis.loadArm, analysis.effortArm);
  return {
    mode: 'lever',
    analysis,
    geometry,
    loadMass: s.mass,
    loadForce: analysis.loadForce,
    required: analysis.effortRequired,
    effort: s.effort,
    effortMax: effortMaxFor('lever'),
    enough: analysis.enough,
    mechanicalAdvantage: analysis.mechanicalAdvantage,
    work: leverWork(input),
    lanes: [
      {
        enough: analysis.enough,
        ratio: effortRatio(s.effort, analysis.effortRequired),
        handTravel: geometry.effortDrop,
        pathLength: geometry.loadRise,
        fallAccel: GRAVITY,
      },
    ],
  };
}

export function inclineModel(s: InclineState): MachineModel {
  const height = Math.min(s.height, maxRampHeight(s.length));
  const input = { loadMass: s.mass, length: s.length, height, effort: s.effort };
  const analysis = inclineAnalysis(input);
  return {
    mode: 'incline',
    analysis,
    length: s.length,
    height,
    loadMass: s.mass,
    loadForce: analysis.loadForce,
    required: analysis.effortRequired,
    effort: s.effort,
    effortMax: effortMaxFor('incline'),
    enough: analysis.enough,
    mechanicalAdvantage: analysis.mechanicalAdvantage,
    work: inclineWork(input),
    lanes: [
      {
        enough: analysis.enough,
        ratio: effortRatio(s.effort, analysis.effortRequired),
        handTravel: s.length,
        pathLength: s.length,
        // Down the slope the box feels only the part of its weight along it.
        fallAccel: GRAVITY * Math.sin(analysis.angle),
      },
      // The same box lifted straight up, for comparison.
      {
        enough: analysis.canLiftStraight,
        ratio: effortRatio(s.effort, analysis.liftForce),
        handTravel: height,
        pathLength: height,
        fallAccel: GRAVITY,
      },
    ],
  };
}

export function pulleyModel(s: PulleyState): MachineModel {
  const input = { loadMass: s.mass, pulleys: s.pulleys, effort: s.effort };
  const analysis = pulleyAnalysis(input);
  return {
    mode: 'pulley',
    analysis,
    pulleys: analysis.segments,
    loadMass: s.mass,
    loadForce: analysis.loadForce,
    required: analysis.effortRequired,
    effort: s.effort,
    effortMax: effortMaxFor('pulley'),
    enough: analysis.enough,
    mechanicalAdvantage: analysis.mechanicalAdvantage,
    work: pulleyWork(input),
    lanes: [
      {
        enough: analysis.enough,
        ratio: effortRatio(s.effort, analysis.effortRequired),
        handTravel: PULLEY_TRAVEL * analysis.segments,
        pathLength: PULLEY_TRAVEL,
        fallAccel: GRAVITY,
      },
    ],
  };
}

export function buildModel(mode: MachineId, states: MachineStates): MachineModel {
  switch (mode) {
    case 'lever':
      return leverModel(states.lever);
    case 'incline':
      return inclineModel(states.incline);
    case 'pulley':
      return pulleyModel(states.pulley);
  }
}
