/**
 * Password rules, as data rather than a single boolean.
 *
 * The sign-up screen shows every rule from the moment the field is focused and
 * ticks them off as they are met, so the user is never told "invalid password"
 * after the fact and left guessing which part was wrong. That only works if
 * each rule can be evaluated on its own — hence a list, not a regex.
 *
 * Rule ids are translation key suffixes: `auth.password.rules.<id>`.
 */

export type PasswordRuleId = 'length' | 'uppercase' | 'lowercase' | 'number';

export interface PasswordRule {
  id: PasswordRuleId;
  test: (password: string) => boolean;
}

/** Supabase enforces a minimum of its own; ours is the stricter of the two. */
export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', test: (p) => p.length >= MIN_PASSWORD_LENGTH },
  { id: 'uppercase', test: (p) => /[A-Z]/.test(p) },
  { id: 'lowercase', test: (p) => /[a-z]/.test(p) },
  { id: 'number', test: (p) => /[0-9]/.test(p) },
];

export interface PasswordRuleState {
  id: PasswordRuleId;
  met: boolean;
}

/** Every rule with its current state, in display order. */
export function checkPassword(password: string): PasswordRuleState[] {
  return PASSWORD_RULES.map((rule) => ({ id: rule.id, met: rule.test(password) }));
}

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

/**
 * Email check.
 *
 * Deliberately loose — the real verification is the confirmation mail. This
 * only catches the obvious slip (a missing @, a trailing comma) before a
 * round-trip to the server.
 */
export function isEmailShaped(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Display names are trimmed and length-capped; anything non-empty will do. */
export const MAX_DISPLAY_NAME_LENGTH = 40;

export function isDisplayNameValid(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_DISPLAY_NAME_LENGTH;
}
