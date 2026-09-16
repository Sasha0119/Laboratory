import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { useAuth } from '../context/Auth';
import { canAccessLevel, hasPaidAccess, isLevelGated } from '../lib/access';
import type { Topic } from '../lib/catalogue';
import type { DifficultyLevel } from '../lib/difficulty';

/**
 * The gate every screen asks before opening paid content.
 *
 * It joins the two halves that must not know about each other: `lib/access`
 * holds the rule, `context/Auth` holds who the reader is, and this hook is the
 * only place they meet. A new topic plugs in by calling `open()` instead of
 * `router.push()` — it never has to know what a subscription is.
 *
 * When real purchases ship, the change is confined to how `subscriptionStatus`
 * is sourced in `context/Auth`. Nothing here, and nothing that calls it, moves.
 */

export interface ContentAccess {
  /** False until the stored session has been read back. */
  ready: boolean;
  /** Whether this reader has paid access right now. */
  isPro: boolean;
  /** Whether a level needs paid access at all, regardless of who is reading. */
  isGated: (level: DifficultyLevel) => boolean;
  /** Whether this reader may open this level. */
  canAccess: (level: DifficultyLevel) => boolean;
  /** Whether this reader may open this topic. */
  canOpen: (topic: Topic) => boolean;
  /**
   * Whether the lock should be drawn on a topic card: gated, and not unlocked
   * for this reader.
   */
  isLocked: (topic: Topic) => boolean;
  /**
   * Navigate to a topic, or to the paywall if it is out of reach.
   *
   * Returns true if the topic itself was opened, so a caller that wants to do
   * something extra on a real open can.
   */
  open: (topic: Topic) => boolean;
  /** Send the reader to the paywall for a level, without a topic in hand. */
  showPaywall: (level: DifficultyLevel) => void;
}

export function useContentAccess(): ContentAccess {
  const router = useRouter();
  const { ready, subscriptionStatus } = useAuth();

  const showPaywall = useCallback(
    (level: DifficultyLevel) => {
      // The level rides along so the paywall can name what was reached for,
      // rather than pitching in the abstract.
      router.push({ pathname: '/paywall', params: { level } });
    },
    [router]
  );

  const canAccess = useCallback(
    (level: DifficultyLevel) => canAccessLevel(level, subscriptionStatus),
    [subscriptionStatus]
  );

  const canOpen = useCallback((topic: Topic) => canAccess(topic.level), [canAccess]);

  const isLocked = useCallback(
    (topic: Topic) => isLevelGated(topic.level) && !canAccess(topic.level),
    [canAccess]
  );

  const open = useCallback(
    (topic: Topic) => {
      if (!topic.href) return false;
      if (!canAccess(topic.level)) {
        showPaywall(topic.level);
        return false;
      }
      router.push(topic.href as never);
      return true;
    },
    [canAccess, router, showPaywall]
  );

  return useMemo(
    () => ({
      ready,
      isPro: hasPaidAccess(subscriptionStatus),
      isGated: isLevelGated,
      canAccess,
      canOpen,
      isLocked,
      open,
      showPaywall,
    }),
    [ready, subscriptionStatus, canAccess, canOpen, isLocked, open, showPaywall]
  );
}
