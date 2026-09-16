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
 * Deep link the password-reset email sends the user back to.
 *
 * Matches the `scheme` in app.json. Add this exact URL to
 * Authentication → URL Configuration → Redirect URLs in the Supabase
 * dashboard, otherwise Supabase refuses the redirect.
 */
export const PASSWORD_RESET_REDIRECT = 'laboratory://auth/reset-password';
