/**
 * The topic catalogue.
 *
 * Lifted out of the Physics index screen so that the list and the route guards
 * cannot disagree. A card that shows a lock and a screen that refuses to open
 * now read the same row, which means a topic added here is gated correctly
 * everywhere without touching either.
 *
 * Ids and metadata only — every title and summary is looked up at
 * `physicsIndex.sims.<id>.*`. `level` is the level the topic is aimed at, and
 * therefore also what decides whether it is free (see `lib/access`). `href` is
 * what makes a topic real: anything without one renders as a Coming Soon card.
 */

import type { DifficultyLevel } from '../difficulty';

export interface Topic {
  id: string;
  level: DifficultyLevel;
  /** Chips shown on working simulations; placeholders do not carry them. */
  topics?: string[];
  href?: string;
}

export const TOPICS: Topic[] = [
  // --- Beginner -----------------------------------------------------------
  {
    id: 'drop',
    level: 'beginner',
    topics: ['kinematics', 'drag', 'terminalVelocity'],
    href: '/physics/drop',
  },
  {
    id: 'simpleCircuits',
    level: 'beginner',
    topics: ['voltage', 'current', 'resistance'],
    href: '/physics/circuits',
  },
  {
    id: 'magnets',
    level: 'beginner',
    topics: ['magneticField', 'attraction', 'repulsion'],
    href: '/physics/magnets',
  },
  { id: 'statesOfMatter', level: 'beginner' },
  { id: 'simpleMachines', level: 'beginner' },

  // --- Intermediate -------------------------------------------------------
  {
    id: 'collisions',
    level: 'intermediate',
    topics: ['momentum', 'energy', 'bounciness'],
    href: '/physics/collisions',
  },
  { id: 'waves', level: 'intermediate' },
  { id: 'light', level: 'intermediate' },
  { id: 'ohmsLaw', level: 'intermediate' },
  { id: 'energyConservation', level: 'intermediate' },
  { id: 'pressureBuoyancy', level: 'intermediate' },

  // --- Pro / University ---------------------------------------------------
  { id: 'rotational', level: 'pro' },
  { id: 'induction', level: 'pro' },
  { id: 'harmonicMotion', level: 'pro' },
  { id: 'thermodynamics', level: 'pro' },
  { id: 'advancedDrag', level: 'pro' },
];

/** Look a topic up by its route, for guards that only know where they are. */
export function topicForHref(href: string | null | undefined): Topic | undefined {
  if (!href) return undefined;
  return TOPICS.find((topic) => topic.href === href);
}

export function topicById(id: string): Topic | undefined {
  return TOPICS.find((topic) => topic.id === id);
}
