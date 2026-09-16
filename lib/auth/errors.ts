/**
 * Turns a Supabase auth failure into a translation key.
 *
 * Supabase returns English message strings, which would otherwise be the one
 * place in the app that ignores the language setting. Everything here maps to
 * `auth.errors.<id>`; anything unrecognised falls back to a generic message
 * rather than leaking a raw server string into a Chinese or Uzbek screen.
 */

import type { AuthError } from '@supabase/supabase-js';

export type AuthErrorId =
  | 'notConfigured'
  | 'invalidCredentials'
  | 'emailTaken'
  | 'emailNotConfirmed'
  | 'weakPassword'
  | 'rateLimited'
  | 'network'
  | 'unknown';

export function authErrorId(error: unknown): AuthErrorId {
  if (!error) return 'unknown';

  const err = error as Partial<AuthError> & { message?: string; status?: number };
  const code = typeof err.code === 'string' ? err.code : '';
  const message = (err.message ?? '').toLowerCase();

  // `code` is the stable identifier; the message match is a fallback for
  // older gotrue responses that only carry prose.
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'invalidCredentials';
  }
  if (code === 'user_already_exists' || code === 'email_exists' || message.includes('already registered')) {
    return 'emailTaken';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'emailNotConfirmed';
  }
  if (code === 'weak_password' || message.includes('password should be')) {
    return 'weakPassword';
  }
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || err.status === 429) {
    return 'rateLimited';
  }
  if (message.includes('network') || message.includes('fetch failed') || message.includes('timeout')) {
    return 'network';
  }
  return 'unknown';
}

/** The i18next key for an error, ready to hand to `t()`. */
export function authErrorKey(error: unknown): string {
  return `auth.errors.${authErrorId(error)}`;
}
