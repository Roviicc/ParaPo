import type { SupabaseClient } from '@supabase/supabase-js';
import * as z from 'zod/mini';

import { AccountError, accountProblemOf, type AccountProblem } from './account-problem';
import { CONTRIBUTOR_AUTH_KEY, type ContributeClient } from './contribute-client';
import { aroundEarlierIdentity, finishPendingClaim } from './earlier-identity';
import { requireClient } from './require-client';
import { ensureSignedIn } from './upload-contribution';
import { UploadError } from './upload-problem';

/** Who is signed in to an account. */
export interface Account {
  id: string;
  email: string;
  /** Whether the account's name is stored; an account made but not finished has none. */
  hasProfile: boolean;
}

export interface SignUpInput {
  name: string;
  email: string;
  /** Already in the form the database stores: +639XXXXXXXXX. */
  phone: string;
  password: string;
  captchaToken?: string;
}

export interface SignInInput {
  email: string;
  password: string;
  captchaToken?: string;
}

const userSchema = z.object({
  id: z.string(),
  email: z.optional(z.string()),
  is_anonymous: z.optional(z.boolean()),
});

const storedSessionSchema = z.object({ user: userSchema });

/** The account a user is, or null for an anonymous user: an anonymous phone is not signed in to one. */
function accountOf(user: unknown, hasProfile: boolean): Account | null {
  const parsed = userSchema.safeParse(user);
  if (!parsed.success || parsed.data.is_anonymous || !parsed.data.email) return null;
  return { id: parsed.data.id, email: parsed.data.email, hasProfile };
}

/**
 * The session as the phone last stored it, for when Supabase cannot answer: its token is expired
 * and cannot be renewed for want of signal, or its code did not load. A signed-in contributor can
 * still record then. Whether the profile is stored is not known, so it is taken as stored.
 */
export function storedAccount(): Account | null {
  const raw = window.localStorage.getItem(CONTRIBUTOR_AUTH_KEY);
  if (!raw) return null;
  try {
    const parsed = storedSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? accountOf(parsed.data.user, true) : null;
  } catch {
    // Unreadable storage is no session; signing in again replaces it.
    return null;
  }
}

const profileRowsSchema = z.array(z.object({ name: z.nullable(z.string()) }));

/**
 * Whether the signed-in account's name is stored. Unknown without an answer (no signal, or the
 * database not having get_profile yet): then yes, so a phone is not shut out of recording for it.
 */
async function hasProfileOf(client: ContributeClient): Promise<boolean> {
  // Not in the generated types until ticket 01 is applied and they are regenerated.
  const untyped: SupabaseClient = client;
  const { data, error, status } = await untyped.rpc('get_profile');
  if (error) {
    if (status !== 0)
      console.warn(`ParaPo did not give the profile (HTTP ${status}):`, error.message);
    return true;
  }
  const rows = profileRowsSchema.safeParse(data);
  return rows.success ? Boolean(rows.data[0]?.name) : true;
}

/** Who is signed in to an account on this phone, or null. */
export async function fetchAccount(): Promise<Account | null> {
  let client: ContributeClient;
  try {
    client = await requireClient();
  } catch (error) {
    // The client's code did not load: no signal. The stored session still says who this is.
    if (error instanceof UploadError && error.problem === 'offline') return storedAccount();
    throw error;
  }
  const { data, error } = await client.auth.getSession();
  if (error) return storedAccount();
  const account = accountOf(data.session?.user, true);
  if (!account) return null;
  // A claim the last sign-in could not finish is tried again at every start, without waiting for it.
  void finishPendingClaim(client);
  return { ...account, hasProfile: await hasProfileOf(client) };
}

/** The error to throw for a failed Auth call, logging one the page does not know. */
function authError(error: Parameters<typeof accountProblemOf>[0]): AccountError {
  const problem = accountProblemOf(error);
  if (problem === 'not-accepting') {
    console.warn(`ParaPo did not accept the request (HTTP ${error.status}):`, error.message);
  }
  return new AccountError(problem, error.message);
}

/** The AccountError for a failure while making sure the phone has a user to make an account of. */
function accountErrorOf(error: unknown): AccountError {
  if (error instanceof AccountError) return error;
  if (error instanceof UploadError) {
    const problems: Partial<Record<UploadError['problem'], AccountProblem>> = {
      offline: 'offline',
      'check-failed': 'check-failed',
      unavailable: 'unavailable',
    };
    return new AccountError(problems[error.problem] ?? 'not-accepting', error.message);
  }
  throw error;
}

/** The profile's name and number, stored on the contributor row. Needs an account's session. */
async function sendProfile(
  client: ContributeClient,
  { name, phone }: Pick<SignUpInput, 'name' | 'phone'>,
): Promise<void> {
  // TODO: typed rpc once 01 is applied and database types are regenerated.
  const untyped: SupabaseClient = client;
  const { error, status } = await untyped.rpc('set_profile', { name, phone });
  if (error) {
    if (status === 0) throw new AccountError('offline', error.message);
    console.warn(`ParaPo did not take the profile (HTTP ${status}):`, error.message);
    throw new AccountError('profile-not-saved', error.message);
  }
}

/** The account now signed in, with its profile stored. */
async function signedInAccount(client: ContributeClient): Promise<Account> {
  const { data } = await client.auth.getSession();
  const account = accountOf(data.session?.user, true);
  if (!account) throw new AccountError('not-accepting', 'There is no account after signing in.');
  return account;
}

/**
 * Makes an account of this phone: its anonymous user becomes a permanent one with the same id, so
 * every upload the phone already sent is the account's at once. If only the profile then fails,
 * the account stays and `saveProfile` finishes it.
 */
export async function signUp(input: SignUpInput): Promise<Account> {
  try {
    await ensureSignedIn(input.captchaToken);
    const client = await requireClient();
    const { error } = await client.auth.updateUser({
      email: input.email,
      password: input.password,
    });
    if (error) throw authError(error);
    await sendProfile(client, input);
    return await signedInAccount(client);
  } catch (error) {
    throw accountErrorOf(error);
  }
}

/** Finishes an account that has none: stores the name and number. Its email is already set. */
export async function saveProfile(input: Pick<SignUpInput, 'name' | 'phone'>): Promise<Account> {
  try {
    const client = await requireClient();
    await sendProfile(client, input);
    return await signedInAccount(client);
  } catch (error) {
    throw accountErrorOf(error);
  }
}

/** Signs in to an account made on this or another phone. */
export async function signIn(input: SignInInput): Promise<Account> {
  try {
    const client = await requireClient();
    const { data, error } = await aroundEarlierIdentity(client, () =>
      client.auth.signInWithPassword({
        email: input.email,
        password: input.password,
        options: input.captchaToken ? { captchaToken: input.captchaToken } : undefined,
      }),
    );
    if (error) throw authError(error);
    const account = accountOf(data.user, await hasProfileOf(client));
    if (!account) throw new AccountError('not-accepting', 'The account has no email.');
    return account;
  } catch (error) {
    throw accountErrorOf(error);
  }
}

/**
 * Signs out this phone only: another phone signed in to the account stays signed in. The phone's
 * own recordings stay on it, to be sent after the next sign-in.
 */
export async function signOut(): Promise<void> {
  try {
    const client = await requireClient();
    const { error } = await client.auth.signOut({ scope: 'local' });
    // Without signal the server is not told, but the phone's own session is gone all the same.
    if (error && accountProblemOf(error) !== 'offline') throw authError(error);
  } catch (error) {
    throw accountErrorOf(error);
  }
}
