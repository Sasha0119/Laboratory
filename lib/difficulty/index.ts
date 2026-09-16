/**
 * Difficulty levels, and everything that varies with them.
 *
 * This module is the single place that answers "what changes at this level?".
 * Screens ask it questions — should the detail toggle start on, which formulas
 * are worth showing, which wording to use — rather than branching on the level
 * themselves. A new simulation plugs in by adding a `FORMULAS` entry and using
 * the same helpers.
 *
 * It holds no display text: every label is a translation key resolved by the
 * caller. Mathematical notation is the one exception, for the same reason unit
 * symbols are — an equation is written the same way in every language.
 */

export type DifficultyLevel = 'beginner' | 'intermediate' | 'pro';

/** Presentation order, easiest first. */
export const DIFFICULTY_ORDER: DifficultyLevel[] = ['beginner', 'intermediate', 'pro'];

export const DEFAULT_DIFFICULTY: DifficultyLevel = 'beginner';

export function isDifficultyLevel(value: unknown): value is DifficultyLevel {
  return typeof value === 'string' && DIFFICULTY_ORDER.includes(value as DifficultyLevel);
}

/** How far up the ladder a level sits, for "at least this level" comparisons. */
export function levelRank(level: DifficultyLevel): number {
  return DIFFICULTY_ORDER.indexOf(level);
}

export function atLeast(level: DifficultyLevel, minimum: DifficultyLevel): boolean {
  return levelRank(level) >= levelRank(minimum);
}

/**
 * Whether "Show detailed data" starts switched on.
 *
 * Only the starting position — the user can still flip it by hand at any
 * level. A university reader should not have to go looking for the real
 * numbers; a beginner should not be handed them unasked.
 */
export function detailDefaultFor(level: DifficultyLevel): boolean {
  return level === 'pro';
}

/**
 * How prominently the underlying equations are shown.
 *
 *   hidden      — beginners get a plain-language blurb instead
 *   collapsible — offered, but folded away until asked for
 *   open        — shown expanded, because at this level they are the point
 */
export type FormulaDisplay = 'hidden' | 'collapsible' | 'open';

export function formulaDisplayFor(level: DifficultyLevel): FormulaDisplay {
  if (level === 'beginner') return 'hidden';
  if (level === 'intermediate') return 'collapsible';
  return 'open';
}

/**
 * Whether to use precise physics vocabulary ("velocity", with a direction)
 * rather than everyday wording ("speed").
 */
export function usesPreciseTerms(level: DifficultyLevel): boolean {
  return level !== 'beginner';
}

/** Whether to surface secondary quantities like momentum and kinetic energy. */
export function showsExtraQuantities(level: DifficultyLevel): boolean {
  return level === 'pro';
}

/** Whether a short plain-language explanation accompanies the simulation. */
export function showsBlurb(level: DifficultyLevel): boolean {
  return level !== 'pro';
}

// ------------------------------------------------------------------ formulas

export interface Formula {
  /** Translation key suffix: `formulas.<module>.<id>`. */
  id: string;
  /**
   * The equation itself. Kept in code rather than the locale files because
   * mathematical notation is international, exactly like the unit symbols —
   * only the caption around it is translated.
   */
  expression: string;
  /** Lowest level at which this equation is worth showing. */
  minLevel: DifficultyLevel;
}

export type SimulationModule = 'drop' | 'collisions' | 'circuits' | 'magnets';

export const FORMULAS: Record<SimulationModule, Formula[]> = {
  drop: [
    { id: 'position', expression: 'y = y₀ + v₀ᵧ·t − ½·g·t²', minLevel: 'intermediate' },
    { id: 'velocity', expression: 'vᵧ = v₀ᵧ − g·t', minLevel: 'intermediate' },
    { id: 'fallTime', expression: 't = √(2h / g)', minLevel: 'intermediate' },
    { id: 'drag', expression: 'F_d = ½·ρ·v²·C_d·A', minLevel: 'pro' },
    { id: 'terminal', expression: 'v∞ = √(2mg / (ρ·C_d·A))', minLevel: 'pro' },
  ],
  collisions: [
    { id: 'momentum', expression: 'm₁v₁ + m₂v₂ = m₁v₁′ + m₂v₂′', minLevel: 'intermediate' },
    { id: 'inelastic', expression: 'v′ = (m₁v₁ + m₂v₂) / (m₁ + m₂)', minLevel: 'intermediate' },
    {
      id: 'elastic',
      expression: 'v₁′ = ((m₁ − m₂)v₁ + 2m₂v₂) / (m₁ + m₂)',
      minLevel: 'intermediate',
    },
    { id: 'restitution', expression: 'e = (v₂′ − v₁′) / (v₁ − v₂)', minLevel: 'pro' },
    { id: 'kineticEnergy', expression: 'KE = ½·m·v²', minLevel: 'pro' },
  ],
  circuits: [
    { id: 'ohmsLaw', expression: 'V = I·R', minLevel: 'intermediate' },
    { id: 'seriesResistance', expression: 'R_total = R₁ + R₂', minLevel: 'intermediate' },
    { id: 'parallelResistance', expression: '1/R_total = 1/R₁ + 1/R₂', minLevel: 'intermediate' },
    { id: 'power', expression: 'P = I²·R = V·I', minLevel: 'pro' },
  ],
  magnets: [{ id: 'poleForce', expression: 'F = k·p₁·p₂ / r²', minLevel: 'intermediate' }],
};

/** The equations worth showing for a module at a given level. */
export function formulasFor(module: SimulationModule, level: DifficultyLevel): Formula[] {
  if (formulaDisplayFor(level) === 'hidden') return [];
  return FORMULAS[module].filter((f) => atLeast(level, f.minLevel));
}
