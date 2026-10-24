import * as z from 'zod/mini';

import type { ContributionPayload } from './contribution-payload-schema';
import { requireClient } from './require-client';
import { UploadError, problemOf, signInProblemOf, type DatabaseError } from './upload-problem';

/** The error to throw for a database answer, logging one the page does not know. */
export function answerError(error: DatabaseError, status: number): UploadError {
  const problem = problemOf(error, status);
  if (problem === 'not-accepting') {
    console.warn(`ParaPo did not accept the request (HTTP ${status}):`, error.message);
  }
  return new UploadError(problem, error.message);
}

/**
 * The phone's anonymous identity, signing in on first use. `captchaToken` is the
 * Turnstile answer, needed once Supabase asks for one.
 */
export async function ensureSignedIn(captchaToken?: string): Promise<string> {
  const client = await requireClient();
  const { data } = await client.auth.getSession();
  if (data.session) return data.session.user.id;
  const signedIn = await client.auth.signInAnonymously(
    captchaToken ? { options: { captchaToken } } : undefined,
  );
  if (signedIn.error) {
    const problem = signInProblemOf(signedIn.error);
    if (problem === 'not-accepting') {
      console.warn(
        `Signing in was refused (HTTP ${signedIn.error.status}):`,
        signedIn.error.message,
      );
    }
    throw new UploadError(problem, `Signing in failed: ${signedIn.error.message}`);
  }
  if (!signedIn.data.user) {
    console.warn('Signing in answered with no user.');
    throw new UploadError('not-accepting', 'Signing in failed: no user');
  }
  return signedIn.data.user.id;
}

/** The phone's identity now, or null before its first upload. */
export async function currentIdentity(): Promise<string | null> {
  const client = await requireClient();
  const { data } = await client.auth.getSession();
  return data.session?.user.id ?? null;
}

const saveAnswerSchema = z.enum(['saved', 'already saved']);

/**
 * Sends one recording. Safe to repeat: the database keys it by the id the phone
 * made, so a resend answers 'already saved' and stores nothing twice.
 */
export async function uploadContribution(
  payload: ContributionPayload,
): Promise<'saved' | 'already saved'> {
  const client = await requireClient();
  const { data, error, status } = await client.rpc('save_contribution', { recording: payload });
  if (error) throw answerError(error, status);
  const answer = saveAnswerSchema.safeParse(data);
  if (!answer.success) {
    console.warn('ParaPo gave an unexpected answer to an upload:', data);
    throw new UploadError('not-accepting', `Unexpected answer: ${String(data)}`);
  }
  return answer.data;
}

/** The ids of this phone's own uploads still in ParaPo; row security answers no one else's. */
export async function uploadsStillThere(): Promise<Set<string>> {
  const client = await requireClient();
  const { data, error, status } = await client.from('contribution').select('id');
  if (error) throw answerError(error, status);
  return new Set(
    z
      .array(z.object({ id: z.string() }))
      .parse(data)
      .map((row) => row.id),
  );
}

/**
 * Removes an uploaded recording from the database, with its points and hintos.
 * The phone's own copy is untouched. Removing one already gone is not an error.
 * Only the signed-in contributor's own: an editor's session can delete anyone's, so the filter is
 * here and not left to row security.
 */
export async function removeUpload(contributionId: string): Promise<void> {
  const client = await requireClient();
  const { data } = await client.auth.getSession();
  if (!data.session) throw new UploadError('blocked', 'Removing needs a signed-in contributor.');
  const { error, status } = await client
    .from('contribution')
    .delete()
    .eq('id', contributionId)
    .eq('contributor_id', data.session.user.id);
  if (error) throw answerError(error, status);
}
