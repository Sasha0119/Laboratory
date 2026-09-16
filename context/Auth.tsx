import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { authErrorKey } from '../lib/auth/errors';
import { PASSWORD_RESET_REDIRECT, isSupabaseConfigured } from '../lib/supabase/config';
import { startAutoRefresh, stopAutoRefresh, supabase } from '../lib/supabase/client';
import { isSubscriptionStatus, type Profile, type SubscriptionStatus } from '../lib/supabase/types';

/**
 * Who is using the app, and what they have paid for.
 *
 * Same shape as `LanguageProvider` and `DifficultyProvider` — a `ready` flag
 * the navigator waits on, state restored from storage at startup — with one
 * addition: the session itself is restored by supabase-js from AsyncStorage,
 * so a returning user is signed in before the first screen paints.
 *
 * This provider knows nothing about which content costs money. It reports the
 * subscription status; `lib/access` decides what that buys.
 */

/** Remembers that the reader chose to look around without an account. */
const GUEST_KEY = 'laboratory.guestMode';

export type AuthMode =
  /** First launch: no session, no decision made yet. Shows the welcome screen. */
  | 'undecided'
  /** Chose "Continue as guest". Free content, no account. */
  | 'guest'
  /** Signed in. */
  | 'account';

export type AuthResult =
  | { ok: true; needsEmailConfirmation?: boolean }
  | { ok: false; errorKey: string };

interface AuthValue {
  ready: boolean;
  mode: AuthMode;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** null for guests and logged-out readers. */
  subscriptionStatus: SubscriptionStatus | null;
  displayName: string | null;
  /** False until real Supabase credentials are pasted into .env. */
  configured: boolean;

  signUp: (email: string, password: string, displayName: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  continueAsGuest: () => void;
  /** Re-reads the profile — how a manual upgrade in the dashboard is picked up. */
  refreshProfile: () => Promise<void>;
}

const NOT_CONFIGURED: AuthResult = { ok: false, errorKey: 'auth.errors.notConfigured' };

const AuthContext = createContext<AuthValue>({
  ready: false,
  mode: 'undecided',
  session: null,
  user: null,
  profile: null,
  subscriptionStatus: null,
  displayName: null,
  configured: false,
  signUp: async () => NOT_CONFIGURED,
  signIn: async () => NOT_CONFIGURED,
  signOut: async () => {},
  sendPasswordReset: async () => NOT_CONFIGURED,
  continueAsGuest: () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [guest, setGuest] = useState(false);
  const [ready, setReady] = useState(false);

  /** Guards against a slow profile fetch landing after a sign-out. */
  const currentUserId = useRef<string | null>(null);

  // ------------------------------------------------------------ profile ----

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    // Ignore a response for a user who has since signed out.
    if (currentUserId.current !== userId) return;

    if (error || !data) {
      // No row yet — the sign-up trigger may not have fired, or the schema was
      // never installed. Treat it as a free account rather than blocking the
      // app: the worst case is that a paying user sees the paywall until the
      // next refresh, which is far better than a reader stuck on a spinner.
      setProfile(null);
      return;
    }

    setProfile({
      ...data,
      subscription_status: isSubscriptionStatus(data.subscription_status)
        ? data.subscription_status
        : 'free',
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId || !isSupabaseConfigured) return;
    await loadProfile(userId);
  }, [session?.user.id, loadProfile]);

  // ------------------------------------------------------------ startup ----

  useEffect(() => {
    let cancelled = false;

    // The guest flag is read regardless of whether a backend is configured —
    // without credentials, every reader is effectively a guest.
    const restoreGuest = AsyncStorage.getItem(GUEST_KEY)
      .then((saved) => {
        if (!cancelled && saved === 'true') setGuest(true);
      })
      .catch(() => {
        // Storage is a convenience; the welcome screen simply shows again.
      });

    if (!isSupabaseConfigured) {
      restoreGuest.finally(() => {
        if (!cancelled) setReady(true);
      });
      return () => {
        cancelled = true;
      };
    }

    const restoreSession = supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        currentUserId.current = data.session?.user.id ?? null;
        setSession(data.session);
        if (data.session) return loadProfile(data.session.user.id);
      })
      .catch(() => {
        // A stored session that will not refresh means signed out. Nothing to
        // recover, and the app is still fully usable at Beginner level.
      });

    Promise.all([restoreGuest, restoreSession]).finally(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  // Keep in step with sign-in, sign-out and token refresh from anywhere,
  // including the password-reset deep link.
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      const changedUser = nextUserId !== currentUserId.current;

      currentUserId.current = nextUserId;
      setSession(nextSession);

      if (!nextUserId) {
        setProfile(null);
        return;
      }
      // A token refresh keeps the same user; no need to re-read the profile.
      //
      // Deferred by a tick on purpose: supabase-js holds an internal lock for
      // the duration of this callback, and a `from()` query needs that same
      // lock to attach the access token. Starting it here would deadlock.
      if (changedUser) setTimeout(() => void loadProfile(nextUserId), 0);
    });

    return () => data.subscription.unsubscribe();
  }, [loadProfile]);

  // Refresh tokens only while the app is on screen, and take the chance to
  // re-read the profile — this is what makes a manual upgrade in the Supabase
  // dashboard show up without the user reinstalling anything.
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const handle = (state: AppStateStatus) => {
      if (state === 'active') {
        startAutoRefresh();
        const userId = currentUserId.current;
        if (userId) void loadProfile(userId);
      } else {
        stopAutoRefresh();
      }
    };

    if (AppState.currentState === 'active') startAutoRefresh();
    const sub = AppState.addEventListener('change', handle);

    return () => {
      sub.remove();
      stopAutoRefresh();
    };
  }, [loadProfile]);

  // ------------------------------------------------------------ actions ----

  // Note that signing in does not clear the guest flag. A session outranks it
  // in `mode` below, so it changes nothing while signed in — and keeping it
  // means a reader who signs up but has not confirmed their email yet stays a
  // guest rather than being sent back to the welcome screen.

  const signUp = useCallback(
    async (email: string, password: string, displayName: string): Promise<AuthResult> => {
      if (!isSupabaseConfigured) return NOT_CONFIGURED;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // Read by the `handle_new_user` trigger in supabase/schema.sql.
        options: { data: { display_name: displayName.trim() } },
      });

      if (error) return { ok: false, errorKey: authErrorKey(error) };

      // With "Confirm email" on in the dashboard, signUp returns a user but no
      // session — the account exists and is waiting on the emailed link.
      return { ok: true, needsEmailConfirmation: !data.session };
    },
    []
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!isSupabaseConfigured) return NOT_CONFIGURED;

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) return { ok: false, errorKey: authErrorKey(error) };

      return { ok: true };
    },
    []
  );

  const signOut = useCallback(async () => {
    // Drop local state first so the UI never sits on a stale name while the
    // network call is in flight.
    currentUserId.current = null;
    setSession(null);
    setProfile(null);
    // Signing out returns the reader to the guest state they were in before,
    // rather than bouncing them to the welcome screen.
    setGuest(true);
    AsyncStorage.setItem(GUEST_KEY, 'true').catch(() => {});

    if (!isSupabaseConfigured) return;
    await supabase.auth.signOut().catch(() => {
      // The local session is already gone, which is what the user asked for.
    });
  }, []);

  const sendPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured) return NOT_CONFIGURED;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: PASSWORD_RESET_REDIRECT,
    });

    if (error) return { ok: false, errorKey: authErrorKey(error) };
    return { ok: true };
  }, []);

  const continueAsGuest = useCallback(() => {
    setGuest(true);
    AsyncStorage.setItem(GUEST_KEY, 'true').catch(() => {
      // In memory is enough for this session; the choice is offered again next
      // launch, which is harmless.
    });
  }, []);

  // ------------------------------------------------------------- derived ---

  const mode: AuthMode = session ? 'account' : guest ? 'guest' : 'undecided';

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      mode,
      session,
      user: session?.user ?? null,
      profile,
      subscriptionStatus: session ? profile?.subscription_status ?? 'free' : null,
      displayName:
        profile?.display_name ||
        (session?.user.user_metadata?.display_name as string | undefined) ||
        null,
      configured: isSupabaseConfigured,
      signUp,
      signIn,
      signOut,
      sendPasswordReset,
      continueAsGuest,
      refreshProfile,
    }),
    [
      ready,
      mode,
      session,
      profile,
      signUp,
      signIn,
      signOut,
      sendPasswordReset,
      continueAsGuest,
      refreshProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}
