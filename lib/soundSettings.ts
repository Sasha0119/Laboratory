/**
 * The sound on/off setting, shared by every lesson.
 *
 * A tiny external store rather than a React context so the audio code, which
 * lives in plain classes and timers as much as in components, can ask
 * `isSoundEnabled()` at the moment it is about to make a noise. Components use
 * `useSoundEnabled()`, which re-renders when the setting changes.
 *
 * The choice is saved in `localStorage`, like the language and the level.
 */

import { useSyncExternalStore } from 'react';

import { storage } from './storage';

const STORAGE_KEY = 'laboratory.sound';

let enabled = true;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  storage
    .getItem(STORAGE_KEY)
    .then((saved) => {
      if (saved === 'off' && enabled) {
        enabled = false;
        emit();
      }
    })
    .catch(() => {
      // Sound simply stays on.
    });
}

export function isSoundEnabled(): boolean {
  load();
  return enabled;
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  loaded = true;
  emit();
  storage.setItem(STORAGE_KEY, value ? 'on' : 'off').catch(() => {
    // Applied for this visit; it just will not be remembered.
  });
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reactive view of the setting. The server always renders it as on. */
export function useSoundEnabled(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => enabled, () => true);
  return [value, setSoundEnabled];
}
