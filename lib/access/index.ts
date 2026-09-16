/**
 * Who may open what.
 *
 * This module is the single source of truth for the free/paid split, and it is
 * deliberately pure: no React, no Supabase, no navigation. It answers one
 * question — given a difficulty level and a subscription status, is this
 * allowed? — so the rule can be read, changed and tested in one place.
 *
 * The React side lives in `hooks/useContentAccess`, and the screen the user
 * lands on when the answer is no lives in `app/paywall`. Neither of those
 * knows the rule; they only ask.
 *
 * When real purchases arrive, nothing in this file changes. The only thing
 * that changes is where `subscription_status` comes from.
 */

import type { DifficultyLevel } from '../difficulty';
import type { SubscriptionStatus } from '../supabase/types';

/** What a piece of content costs. */
export type AccessTier = 'free' | 'paid';

/**
 * The tier a difficulty level sits in.
 *
 * Beginner is free forever — it is the whole app for a curious 13-year-old,
 * and putting it behind a login would be worse than pointless. Intermediate
 * and Pro are the paid tiers.
 *
 * Note the two senses of "pro" that meet here: `'pro'` the difficulty level is
 * about how the physics is explained, `'pro'` the subscription status is about
 * what has been paid for. They are unrelated ideas that happen to share a word.
 */
export function tierForLevel(level: DifficultyLevel): AccessTier {
  return level === 'beginner' ? 'free' : 'paid';
}

/** Whether a subscription status opens the paid tier. */
export function hasPaidAccess(status: SubscriptionStatus | null): boolean {
  return status === 'pro';
}

/**
 * The one rule.
 *
 * `status` is null for a guest or a logged-out reader — both are treated
 * exactly like a signed-in free user. Free content does not care who you are.
 */
export function canAccessLevel(
  level: DifficultyLevel,
  status: SubscriptionStatus | null
): boolean {
  return tierForLevel(level) === 'free' || hasPaidAccess(status);
}

/** Convenience for list rendering: does this level need an account at all? */
export function isLevelGated(level: DifficultyLevel): boolean {
  return tierForLevel(level) === 'paid';
}
