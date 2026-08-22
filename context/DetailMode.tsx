import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * "Show detailed data" — app-wide, OFF by default.
 *
 * This is the house style for every simulation module, present and future:
 *
 *   - The DEFAULT view shows two or three rounded numbers in plain language
 *     ("Speed", "Height left", "Time"), sized to be read at a glance while
 *     the animation is running.
 *   - Raw physics — component velocities, accelerations, coefficients, exact
 *     unrounded figures, symbolic axis labels — lives behind this flag.
 *
 * It is deliberately a context rather than per-screen state: a reader who
 * turns detail on once expects it to stay on as they move between modules,
 * and a new module should inherit the behaviour by calling `useDetailMode()`
 * instead of inventing its own toggle.
 *
 * Session-scoped on purpose — the app stores nothing on the device.
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
  const [detailed, setDetailed] = useState(false);
  const value = useMemo(() => ({ detailed, setDetailed }), [detailed]);
  return <DetailModeContext.Provider value={value}>{children}</DetailModeContext.Provider>;
}

export function useDetailMode(): DetailModeValue {
  return useContext(DetailModeContext);
}

/**
 * Pick between a plain-language label and its technical form.
 * `label('Speed', '|v| (m/s)')` reads the way it is used at the call site.
 */
export function useLabel(): (plain: string, technical: string) => string {
  const { detailed } = useDetailMode();
  return (plain, technical) => (detailed ? technical : plain);
}
