/**
 * The Supabase client, configured for the browser.
 *
 *   persistSession      The session lives in `localStorage`, so a returning
 *                       visitor is still signed in.
 *   detectSessionInUrl  Off. The password-reset page reads its own link (see
 *                       `lib/auth/recoveryLink`), so the client does not also
 *                       go looking for tokens in every page URL.
 *   autoRefreshToken    On, but only while the tab is visible — see
 *                       `startAutoRefresh` below.
 */

import { createClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import type { Database } from './types';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/**
 * Refresh the access token only while the tab is actually visible.
 *
 * Supabase's timer keeps firing in a hidden tab otherwise, which wastes
 * requests. `AuthProvider` wires these to the page's visibility.
 */
export function startAutoRefresh(): void {
  supabase.auth.startAutoRefresh().catch(() => {
    // A refresh failure is not fatal: the next foreground pass retries, and an
    // expired session simply signs the user out.
  });
}

export function stopAutoRefresh(): void {
  supabase.auth.stopAutoRefresh().catch(() => {
    // Nothing to do — the timer is being torn down anyway.
  });
}
