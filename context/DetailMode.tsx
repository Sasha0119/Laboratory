import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { detailDefaultFor } from '../lib/difficulty';
import { useDifficulty } from './Difficulty';

/**
 * "Show detailed data" — app-wide.
 *
 * This is the house style for every simulation module, present and future:
 *
 *   - The DEFAULT view shows two or three rounded numbers in plain language
 *     ("Speed", "Height left", "Time"), sized to be read at a glance while
 *     the animation is running.
 *   - Raw physics — component velocities, accelerations, coefficients, exact
 *     unrounded figures, symbolic axis labels — lives behind this flag.
 *
 * The starting position now follows the difficulty level (off for Beginner and
 * Intermediate, on for Pro), but the switch stays under the user's control: a
 * manual flip sticks until the level itself changes.
 *
 * It is deliberately a context rather than per-screen state: a reader who
 * turns detail on once expects it to stay on as they move between modules,
 * and a new module should inherit the behaviour by calling `useDetailMode()`
 * instead of inventing its own toggle.
 *
 * Session-scoped on purpose — only the level itself is stored on the device.
 */

interface DetailModeValue {
  detailed: boolean;
  setDetailed: (v: boolean) => void;
}

const DetailModeContext = createContext<DetailModeValue>({
  detailed: false,
  setDetailed: () => {},
});

export function DetailModeProvider({ children }: { children: ReactNode }) {
  const { level, ready } = useDifficulty();
  const [detailed, setDetailed] = useState(() => detailDefaultFor(level));

  // Re-apply the level's default whenever the level changes — including the
  // moment the stored level is first read back at startup. A manual toggle in
  // between is left alone, because this only fires on a genuine level change.
  const lastLevel = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (lastLevel.current === level) return;
    lastLevel.current = level;
    setDetailed(detailDefaultFor(level));
  }, [level, ready]);

  const value = useMemo(() => ({ detailed, setDetailed }), [detailed]);
  return <DetailModeContext.Provider value={value}>{children}</DetailModeContext.Provider>;
}

export function useDetailMode(): DetailModeValue {
  return useContext(DetailModeContext);
}
