import * as z from 'zod/mini';

import { requireClient } from './require-client';
import { answerError } from './upload-contribution';
import { UploadError } from './upload-problem';

/** One of the account's uploads, as the database holds it: whichever phone sent it. */
export interface AccountUpload {
  id: string;
  startedAt: number;
  stoppedAt: number;
  startPointName: string;
  endPointName: string;
  description: string;
}

const MAX_UPLOADS = 500;

const uploadRowsSchema = z.array(
  z.object({
    id: z.string(),
    started_at: z.string(),
    ended_at: z.string(),
    start_name: z.nullable(z.string()),
    end_name: z.nullable(z.string()),
    description: z.nullable(z.string()),
  }),
);

/**
 * Every upload the signed-in account owns, newest first. Asked for by contributor: an editor's
 * session can read everyone's, and must see only its own here. It keeps the newest MAX_UPLOADS:
 * TODO paginate if an account ever sends more.
 */
export async function fetchAccountUploads(): Promise<AccountUpload[]> {
  const client = await requireClient();
  const { data: auth } = await client.auth.getSession();
  if (!auth.session) throw new UploadError('blocked', 'Listing uploads needs a signed-in account.');
  const { data, error, status } = await client
    .from('contribution')
    .select('id, started_at, ended_at, start_name, end_name, description')
    .eq('contributor_id', auth.session.user.id)
    .order('started_at', { ascending: false })
    .limit(MAX_UPLOADS);
  if (error) throw answerError(error, status);
  return uploadRowsSchema.parse(data).map((row) => ({
    id: row.id,
    startedAt: Date.parse(row.started_at),
    stoppedAt: Date.parse(row.ended_at),
    startPointName: row.start_name ?? '',
    endPointName: row.end_name ?? '',
    description: row.description ?? '',
  }));
}
