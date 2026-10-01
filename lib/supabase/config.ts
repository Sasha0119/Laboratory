/**
 * Supabase project credentials.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  WHERE TO PASTE YOUR REAL CREDENTIALS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  1. Copy `.env.example` to `.env` in the project root.
 *  2. In the Supabase dashboard open  Project Settings → API  and copy:
 *
 *       Project URL   →  EXPO_PUBLIC_SUPABASE_URL
 *       anon / public →  EXPO_PUBLIC_SUPABASE_ANON_KEY
 *
 *  3. Restart the bundler with a cleared cache:  npx expo start -c
 *     (EXPO_PUBLIC_* values are inlined at build time, so a running bundler
 *      will not pick up a freshly edited .env.)
 *
 *  The anon key is designed to be shipped inside the app — it is not a secret.
 *  What protects the data is Row Level Security, which `supabase/schema.sql`
 *  turns on. NEVER put the `service_role` key in this file or in .env.
 *
 *  If you would rather not use a .env file, you can replace the two fallback
 *  strings below with your values directly. The .env route is preferred: it
 *  keeps credentials out of git.
 */

import { Platform } from 'react-native';

const PLACEHOLDER_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const PLACEHOLDER_ANON_KEY = 'YOUR-SUPABASE-ANON-KEY';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? PLACEHOLDER_URL;
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? PLACEHOLDER_ANON_KEY;

/**
 * Whether real credentials have been supplied.
 *
 * The app is usable without a backend — Beginner content never needs one — so
 * nothing here throws on startup. Instead the auth screens read this flag and
 * say plainly that the backend is not connected yet, rather than failing with
 * a network error the user cannot act on.
 */
export const isSupabaseConfigured =
  SUPABASE_URL !== PLACEHOLDER_URL &&
  SUPABASE_ANON_KEY !== PLACEHOLDER_ANON_KEY &&
  SUPABASE_URL.startsWith('https://') &&
  SUPABASE_ANON_KEY.length > 20;

/**
 * Where the password-reset email sends the user back to.
 *
 * On a phone that is the app's deep link (the `scheme` in app.json); on the web
 * build it is the site's own /auth/reset-password page, since a browser cannot
 * open a custom scheme. Add BOTH to Authentication → URL Configuration →
 * Redirect URLs in the Supabase dashboard (the site one as
 * `https://your-domain/auth/reset-password`, plus `http://localhost:8081/**`
 * for local web), otherwise Supabase refuses the redirect.
 */
export function passwordResetRedirect(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/reset-password`;
  }
  return 'laboratory://auth/reset-password';
}
