/**
 * The Supabase client, configured for React Native.
 *
 * Three things differ from the browser default:
 *
 *   storage             AsyncStorage, so the session survives an app restart.
 *                       This is the same store the language and difficulty
 *                       settings already use.
 *   detectSessionInUrl  Off. There is no page URL to read a token out of on a
 *                       phone; leaving it on makes the client look for one and
 *                       log noise on every start.
 *   autoRefreshToken    On, but only while the app is in the foreground — see
 *                       `startAutoRefresh` below.
 *
 * `react-native-url-polyfill/auto` must be imported before the client is
 * created: supabase-js parses URLs internally, and Hermes ships an incomplete
 * URL implementation.
 */

import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import type { Database } from './types';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/**
 * Refresh the access token only while the app is actually on screen.
 *
 * Supabase's timer keeps firing in the background otherwise, which on a phone
 * means failed network calls and wasted battery. `AuthProvider` wires these to
 * AppState.
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
