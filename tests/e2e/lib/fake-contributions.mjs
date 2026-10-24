// The contributor page's slice of Supabase, in memory, for the browser suites:
// an anonymous sign-in, save_contribution and a phone deleting its own
// contribution (and reading its own back, the columns it asks for), answered as GoTrue and
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
//   `isEditor` on a user: row security lets it read and delete every contribution, as an editor's.
//   list = 'offline' | 'hold'   reading the account's contributions fails as with no signal (until
//                 `delete fake.next.list`), or waits until `fake.release()`

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
    saveRequests: 0,
    deleteRequests: 0,
    listRequests: 0,
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
      // The faults are for History's list; the phone's check of its own ids is not it.
      const isList = url.searchParams.get('select')?.includes('started_at');
      if (isList) fake.listRequests += 1;
      const fault = isList ? fake.next.list : undefined;
      // An outage lasts until the suite clears it: a page may ask twice (a remount) before it ends.
      if (isList && fault !== 'offline') delete fake.next.list;
      if (fault === 'offline') return route.abort('internetdisconnected');
      if (fault === 'hold') await new Promise((resolve) => (fake.held = resolve));
      // Row security: a contributor reads only its own, from whichever phone sent them; an editor
      // (a user with `isEditor`) reads everyone's. The page's own `contributor_id` filter narrows.
      const user = userOf(request);
      const isEditor = fake.users.get(user ?? '')?.isEditor === true;
      const columns = (url.searchParams.get('select') ?? 'id').split(',').map((c) => c.trim());
      const wanted = /^eq\.(.+)$/.exec(url.searchParams.get('contributor_id') ?? '')?.[1];
      const own = [...fake.rows]
        .filter(([, row]) => (isEditor || row.by === user) && (!wanted || row.by === wanted))
        .map(([id, row]) => ({ id, contributor_id: row.by, ...row.recording }))
        .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))
        .map((recording) => Object.fromEntries(columns.map((c) => [c, recording[c] ?? null])));
      return json(route, 200, own);
    }
    if (url.pathname === '/rest/v1/contribution' && method === 'DELETE') {
      fake.deleteRequests += 1;
      const user = userOf(request);
      const fault = fake.next.remove;
      delete fake.next.remove;
      if (fault === 'removeOffline') return route.abort('internetdisconnected');
      const id = /^eq\.(.+)$/.exec(url.searchParams.get('id') ?? '')?.[1];
      const wanted = /^eq\.(.+)$/.exec(url.searchParams.get('contributor_id') ?? '')?.[1];
      // Row security: a phone deletes only its own; an editor's session can delete anyone's, so
      // what keeps it to its own is the page's `contributor_id` filter. Others' are silently not there.
      const isEditor = fake.users.get(user ?? '')?.isEditor === true;
      const row = id ? fake.rows.get(id) : undefined;
      if (row && (isEditor || row.by === user) && (!wanted || row.by === wanted)) {
        fake.rows.delete(id);
      }
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }

    fake.unknown.push(`${method} ${url.pathname}`);
    return json(route, 501, { message: 'not in the stand-in' });
  });
  return fake;
}
