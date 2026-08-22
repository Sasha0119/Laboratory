import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_DIFFICULTY,
  isDifficultyLevel,
  type DifficultyLevel,
} from '../lib/difficulty';

/**
 * The chosen difficulty level, restored from disk at startup and saved on
 * every change — the same shape as `LanguageProvider`, and stored alongside it.
 *
 * The level is a presentation setting only. It never reaches the physics: the
 * same equations run at every level, and only the amount of explanation around
 * them changes.
 */

const STORAGE_KEY = 'laboratory.difficulty';

interface DifficultyValue {
  level: DifficultyLevel;
  setLevel: (level: DifficultyLevel) => void;
  /** False until the saved choice has been read back from storage. */
  ready: boolean;
}

const DifficultyContext = createContext<DifficultyValue>({
  level: DEFAULT_DIFFICULTY,
  setLevel: () => {},
  ready: false,
});

export function DifficultyProvider({ children }: { children: ReactNode }) {
  const [level, setLevelState] = useState<DifficultyLevel>(DEFAULT_DIFFICULTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (cancelled) return;
        // Ignore anything unrecognised, so a level renamed in a later version
        // cannot leave the app in a state it has no content for.
        if (isDifficultyLevel(saved)) setLevelState(saved);
      })
      .catch(() => {
        // Storage is a convenience; failing to read it just means Beginner.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLevel = useCallback((next: DifficultyLevel) => {
    if (!isDifficultyLevel(next)) return;
    setLevelState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Already applied in memory; it just will not survive a restart.
    });
  }, []);

  const value = useMemo(() => ({ level, setLevel, ready }), [level, setLevel, ready]);

  return <DifficultyContext.Provider value={value}>{children}</DifficultyContext.Provider>;
}

export function useDifficulty(): DifficultyValue {
  return useContext(DifficultyContext);
}
