/**
 * Small persistent key-value store for settings, backed by `localStorage`.
 *
 * The methods are async and tolerate the usual reasons storage is missing
 * (private windows, blocked site data, server rendering): a read that cannot
 * happen resolves to null, and a write that cannot happen rejects so the
 * caller's `.catch` can decide that it does not matter.
 */

function backing(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return backing()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    const store = backing();
    if (!store) throw new Error('Storage unavailable');
    store.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    try {
      backing()?.removeItem(key);
    } catch {
      // Nothing to remove if storage cannot be reached.
    }
  },
};
