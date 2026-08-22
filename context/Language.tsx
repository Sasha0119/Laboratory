import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import i18n, { DEFAULT_LANGUAGE, isSupportedLanguage } from '../lib/i18n';

/**
 * The chosen language, restored from disk at startup and saved on every change.
 *
 * Selection is manual only — nothing here reads the device locale. A first-run
 * user gets English until they pick otherwise on the Settings screen.
 */

const STORAGE_KEY = 'laboratory.language';

interface LanguageValue {
  language: string;
  setLanguage: (code: string) => void;
  /** False until the saved choice has been read back from storage. */
  ready: boolean;
}

const LanguageContext = createContext<LanguageValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  ready: false,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (cancelled) return;
        // Ignore anything unrecognised — a language removed in a later version
        // must not leave the app stuck with no strings.
        if (isSupportedLanguage(saved)) {
          i18n.changeLanguage(saved as string);
          setLanguageState(saved as string);
        }
      })
      .catch(() => {
        // Storage is a convenience; failing to read it just means English.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback((code: string) => {
    if (!isSupportedLanguage(code)) return;
    i18n.changeLanguage(code);
    setLanguageState(code);
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {
      // The switch already happened in memory; it just will not survive a restart.
    });
  }, []);

  const value = useMemo(
    () => ({ language, setLanguage, ready }),
    [language, setLanguage, ready]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageValue {
  return useContext(LanguageContext);
}
