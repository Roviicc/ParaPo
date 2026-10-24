// The contributor page's slice of Supabase, in memory, for the browser suites:
// an anonymous sign-in, save_contribution and a phone deleting its own
// contribution (and reading its own ids back), answered as GoTrue and
// PostgREST answer. Every request to
// *.supabase.co lands here, so no suite ever reaches the live project; one this
// stand-in does not know is answered 501 and counted in `unknown`.
//
// The accounts of the contributor page, too: an anonymous user made an account of (PUT /user,
// which keeps its id), the token renewed (a renewed token is the one that no longer says
// anonymous, as in GoTrue), a password sign-in, a sign-out (the scopes it was asked for are in
// `fake.logouts`), get_profile, and set_profile, which refuses a user that is not an account,
// as migration 01 does. `fake.users` holds them, by id.
//
// The claim of an anonymous phone's uploads by the account it signs in to, as migration 01's
// begin_claim and finish_claim answer: a one-time token for an anonymous user, which an account
// presents to take over that user's contributions (the count moved is the answer; the same token
// again answers 0; a token already used by another account, or one never made, is bad_token).
// `fake.claims` lists the calls in order ('begin_claim', 'password', 'finish_claim') and
// `fake.tokens` holds the tokens by value.
//
// Faults, set on `fake.next` before the request they are for:
//   signupDisabled the sign-in is answered 422, as with sign-ups turned off
//   passwordSignIn = 'offline'  the password sign-in fails as with no signal
//   updateUser = 'emailTaken'   the upgrade to an account is answered 422 email_exists
//   profile = 'offline'         set_profile fails as with no signal
//   offline       the save request fails as with no signal
//   lostAnswer    the save is stored, then the answer is lost on the way back
//   hold          the save waits until `fake.release()` (an upload in flight)
//   refuse        the save is refused: 'bad_points' (never taken) or 'day_cap'
//   removeOffline the delete fails as with no signal
//   beginClaim = 'notAnonymous' begin_claim is answered 42501 not_anonymous, as for a stale token
//   finishClaim = 'offline'    finish_claim fails as with no signal, before it acts
//   finishClaim = 'lostAnswer' finish_claim acts, then the answer is lost on the way back
//   finishClaim = 'expired'    finish_claim is answered token_expired
//   finishClaim = 'forgotten'  the server's day-old cleanup has deleted the used tokens first

const json = (route, status, body) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });

/**
 * A GoTrue session. Its token says anonymous (`fake-<id>`) until it is renewed
 * (`fake-<id>.account`), the way a real token's claim does.
 */
export const session = (userId, { email = null, isAccount = false } = {}) => ({
  access_token: isAccount ? `fake-${userId}.account` : `fake-${userId}`,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: `refresh-${userId}`,
  user: {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    is_anonymous: !isAccount,
    ...(email ? { email } : {}),
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  },
});

/** Routes `page`'s Supabase requests to a fresh stand-in. Register after any other https route. */
export async function fakeContributions(page) {
  const fake = {
    /** The contributions stored, by id, each with the phone that sent it. Delete one to play an editor. */
    rows: new Map(),
    /** Accounts and anonymous users, by id: { email, password, isAccount, profile }. */
    users: new Map(),
    signIns: 0,
    passwordSignIns: 0,
    /** The scope of each sign-out the page sent: 'local' signs out this phone only. */
    logouts: [],
    profileRequests: 0,
    claims: [],
    tokens: new Map(),
    saveRequests: 0,
    deleteRequests: 0,
    /** Set with `context.setOffline(true)`: Playwright does not stop requests a route answers. */
    isOffline: false,
    unknown: [],
    captchaTokens: [],
    next: {},
    held: null,
    release() {
      this.held?.();
      this.held = null;
    },
  };

  const tokenOf = (request) => {
    const auth = request.headers()['authorization'] ?? '';
    const match = /^Bearer fake-([0-9a-f-]{36})(\.account)?$/.exec(auth);
    return match ? { id: match[1], isAccount: match[2] !== undefined } : null;
  };
  const userOf = (request) => tokenOf(request)?.id ?? null;
  const accountByEmail = (email) =>
    [...fake.users].find(([, user]) => user.isAccount && user.email === email);
  const authError = (route, status, code, message) =>
    json(route, status, { code: status, error_code: code, msg: message });

  await page.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      });
    }

    if (fake.isOffline) return route.abort('internetdisconnected');

    if (url.pathname === '/auth/v1/signup' && method === 'POST') {
      fake.signIns += 1;
      const body = request.postDataJSON() ?? {};
      fake.captchaTokens.push(body.gotrue_meta_security?.captcha_token ?? null);
      const fault = fake.next.signIn;
      delete fake.next.signIn;
      if (fault === 'signupDisabled') {
        return json(route, 422, {
          code: 422,
          error_code: 'signup_disabled',
          msg: 'Signups not allowed for this instance',
        });
      }
      const id = crypto.randomUUID();
      fake.users.set(id, { email: null, password: null, isAccount: false, profile: null });
      return json(route, 200, session(id));
    }
    if (url.pathname === '/auth/v1/user' && method === 'GET') {
      const user = userOf(request);
      return user ? json(route, 200, session(user).user) : json(route, 401, { msg: 'no session' });
    }
    if (url.pathname === '/auth/v1/user' && method === 'PUT') {
      const id = userOf(request);
      const known = id && fake.users.get(id);
      if (!known) return authError(route, 401, 'bad_jwt', 'no session');
      const body = request.postDataJSON() ?? {};
      const fault = fake.next.updateUser;
      delete fake.next.updateUser;
      const taken = accountByEmail(body.email);
      if (fault === 'emailTaken' || (taken && taken[0] !== id)) {
        return authError(
          route,
          422,
          'email_exists',
          'A user with this email address has already been registered',
        );
      }
      if (typeof body.password === 'string' && body.password.length < 8) {
        return authError(route, 422, 'weak_password', 'Password should be at least 8 characters.');
      }
      // The same id, now an account: every upload already made stays its own.
      Object.assign(known, { email: body.email, password: body.password, isAccount: true });
      return json(route, 200, session(id, { email: known.email, isAccount: true }).user);
    }
    if (url.pathname === '/auth/v1/token' && method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      const body = request.postDataJSON() ?? {};
      if (grant === 'refresh_token') {
        const id = /^refresh-(.+)$/.exec(body.refresh_token ?? '')?.[1];
        const known = id && fake.users.get(id);
        if (!known)
          return authError(route, 400, 'refresh_token_not_found', 'Invalid Refresh Token');
        return json(route, 200, session(id, { email: known.email, isAccount: known.isAccount }));
      }
      if (grant === 'password') {
        fake.passwordSignIns += 1;
        fake.claims.push('password');
        fake.captchaTokens.push(body.gotrue_meta_security?.captcha_token ?? null);
        const fault = fake.next.passwordSignIn;
        delete fake.next.passwordSignIn;
        if (fault === 'offline') return route.abort('internetdisconnected');
        const found = accountByEmail(body.email);
        if (!found || found[1].password !== body.password) {
          return authError(route, 400, 'invalid_credentials', 'Invalid login credentials');
        }
        return json(route, 200, session(found[0], { email: found[1].email, isAccount: true }));
      }
    }
    if (url.pathname === '/auth/v1/logout' && method === 'POST') {
      fake.logouts.push(url.searchParams.get('scope'));
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
    if (url.pathname === '/rest/v1/rpc/get_profile' && method === 'POST') {
      const known = fake.users.get(userOf(request) ?? '');
      if (!known?.isAccount) return json(route, 200, []);
      return json(route, 200, [
        { name: known.profile?.name ?? null, phone: known.profile?.phone ?? null },
      ]);
    }
    if (url.pathname === '/rest/v1/rpc/set_profile' && method === 'POST') {
      fake.profileRequests += 1;
      const token = tokenOf(request);
      // As migration 01 does: the user must be an account in the database, whatever the token says.
      if (!token || !fake.users.get(token.id)?.isAccount) {
        return json(route, 403, {
          code: '42501',
          message: 'not_an_account',
          details: null,
          hint: null,
        });
      }
      if (fake.next.profile === 'offline') {
        delete fake.next.profile;
        return route.abort('internetdisconnected');
      }
      const { name, phone } = request.postDataJSON();
      if (!/^\+639[0-9]{9}$/.test(phone) || name.length < 1 || name.length > 80) {
        return json(route, 400, {
          code: '23514',
          message: 'bad_profile',
          details: null,
          hint: null,
        });
      }
      const known = fake.users.get(token.id);
      if (known) known.profile = { name, phone };
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }

    if (url.pathname === '/rest/v1/rpc/begin_claim' && method === 'POST') {
      fake.claims.push('begin_claim');
      const token = tokenOf(request);
      const claimError = (code, message) =>
        json(route, 403, { code, message, details: null, hint: null });
      const fault = fake.next.beginClaim;
      delete fake.next.beginClaim;
      if (fault === 'notAnonymous') return claimError('42501', 'not_anonymous');
      if (!token || !fake.users.get(token.id)) return claimError('42501', 'not_signed_in');
      if (fake.users.get(token.id).isAccount) return claimError('42501', 'not_anonymous');
      for (const [value, made] of fake.tokens) {
        if (made.anonymousId === token.id && !made.usedBy) fake.tokens.delete(value);
      }
      const value = crypto.randomUUID();
      fake.tokens.set(value, { anonymousId: token.id, usedBy: null });
      return json(route, 200, value);
    }
    if (url.pathname === '/rest/v1/rpc/finish_claim' && method === 'POST') {
      fake.claims.push('finish_claim');
      const caller = tokenOf(request);
      const claimError = (status, code, message) =>
        json(route, status, { code, message, details: null, hint: null });
      const fault = fake.next.finishClaim;
      delete fake.next.finishClaim;
      if (fault === 'offline') return route.abort('internetdisconnected');
      if (!caller || !fake.users.get(caller.id)) return claimError(403, '42501', 'not_signed_in');
      if (!fake.users.get(caller.id).isAccount) return claimError(403, '42501', 'not_an_account');
      if (fault === 'forgotten') {
        for (const [value, made] of fake.tokens) if (made.usedBy) fake.tokens.delete(value);
      }
      const made = fake.tokens.get(request.postDataJSON().token);
      if (!made) return claimError(400, 'P0001', 'bad_token');
      if (made.usedBy) {
        return made.usedBy === caller.id
          ? json(route, 200, 0)
          : claimError(400, 'P0001', 'bad_token');
      }
      if (fault === 'expired') return claimError(400, 'P0001', 'token_expired');
      if (made.anonymousId === caller.id || fake.users.get(made.anonymousId)?.isAccount) {
        return claimError(400, 'P0001', 'bad_token');
      }
      let moved = 0;
      for (const row of fake.rows.values()) {
        if (row.by === made.anonymousId) {
          row.by = caller.id;
          moved += 1;
        }
      }
      made.usedBy = caller.id;
      if (fault === 'lostAnswer') return route.abort('connectionreset');
      return json(route, 200, moved);
    }

    if (url.pathname === '/rest/v1/rpc/save_contribution' && method === 'POST') {
      fake.saveRequests += 1;
      const user = userOf(request);
      if (!user) return json(route, 401, { code: '42501', message: 'not_signed_in' });
      const fault = fake.next.save;
      delete fake.next.save;
      if (fault === 'offline') return route.abort('internetdisconnected');
      if (fault === 'hold') await new Promise((resolve) => (fake.held = resolve));
      if (fault === 'bad_points' || fault === 'day_cap') {
        const message =
          fault === 'day_cap'
            ? 'day_cap: 20 contributions in 24 hours'
            : 'bad_points: point 2 is faster than 150 km/h';
        return json(route, 400, { code: 'P0001', message, details: null, hint: null });
      }
      const recording = request.postDataJSON().recording;
      const existing = fake.rows.get(recording.id);
      if (existing && existing.by !== user) {
        return json(route, 400, { code: 'P0001', message: 'id_taken', details: null, hint: null });
      }
      if (!existing) fake.rows.set(recording.id, { by: user, recording });
      if (fault === 'lostAnswer') return route.abort('connectionreset');
      return json(route, 200, existing ? 'already saved' : 'saved');
    }

    if (url.pathname === '/rest/v1/contribution' && method === 'GET') {
      // Row security: a phone reads only its own.
      const user = userOf(request);
      const own = [...fake.rows].filter(([, row]) => row.by === user).map(([id]) => ({ id }));
      return json(route, 200, own);
    }
    if (url.pathname === '/rest/v1/contribution' && method === 'DELETE') {
      fake.deleteRequests += 1;
      const user = userOf(request);
      const fault = fake.next.remove;
      delete fake.next.remove;
      if (fault === 'removeOffline') return route.abort('internetdisconnected');
      const id = /^eq\.(.+)$/.exec(url.searchParams.get('id') ?? '')?.[1];
      // Row security: a phone deletes only its own; anyone else's is silently not there.
      if (id && fake.rows.get(id)?.by === user) fake.rows.delete(id);
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }

    fake.unknown.push(`${method} ${url.pathname}`);
    return json(route, 501, { message: 'not in the stand-in' });
  });
  return fake;
}
