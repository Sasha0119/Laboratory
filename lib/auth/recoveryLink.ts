/**
 * Reads the tokens out of a password-reset link.
 *
 * `detectSessionInUrl` is off on mobile — there is no page URL for supabase-js
 * to inspect — so the app opens the deep link itself. Supabase has shipped two
 * shapes of recovery email over the years and a project may be using either,
 * so both are handled:
 *
 *   ?token_hash=…&type=recovery          exchanged with verifyOtp()
 *   #access_token=…&refresh_token=…      handed straight to setSession()
 *
 * The second arrives in the URL *fragment*, which no query-string parser
 * returns, hence the hand-rolled split.
 */

export type RecoveryLink =
  | { kind: 'tokenHash'; tokenHash: string }
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | null;

function paramsOf(part: string | undefined): URLSearchParams {
  return new URLSearchParams(part ?? '');
}

export function parseRecoveryLink(url: string | null | undefined): RecoveryLink {
  if (!url) return null;

  // Split off the fragment first: everything after the first '#'.
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';

  const queryIndex = beforeHash.indexOf('?');
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';

  // A given project uses one shape or the other; check both, either order.
  for (const params of [paramsOf(query), paramsOf(fragment)]) {
    const type = params.get('type');
    if (type && type !== 'recovery') continue;

    const tokenHash = params.get('token_hash');
    if (tokenHash) return { kind: 'tokenHash', tokenHash };

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken };
  }

  return null;
}
