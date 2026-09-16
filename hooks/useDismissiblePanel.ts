import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/**
 * Whether a one-time dismissible panel — a lesson's "what is this" intro,
 * say — should still show. Persisted per `key` so dismissing it sticks
 * across sessions; the reader only has to close it once, the same way the
 * chosen difficulty level or language does.
 *
 * `visible` starts `false` (nothing flashes on screen) until the stored
 * value has been read back, then flips to whatever was actually saved.
 */
export function useDismissiblePanel(key: string) {
  const storageKey = `laboratory.dismissed.${key}`;
  const [dismissed, setDismissedState] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((saved) => {
        if (!cancelled) setDismissedState(saved === '1');
      })
      .catch(() => {
        if (!cancelled) setDismissedState(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const dismiss = useCallback(() => {
    setDismissedState(true);
    AsyncStorage.setItem(storageKey, '1').catch(() => {
      // Already applied in memory; it just will not survive a restart.
    });
  }, [storageKey]);

  return { visible: dismissed === false, dismiss };
}
