import type { SupabaseClient } from '@supabase/supabase-js';
import * as z from 'zod/mini';

import { AccountError } from './account-problem';
import { requireClient } from './require-client';
import { UploadError } from './upload-problem';

/** The name and number an account stored, the number as the database keeps it: +639XXXXXXXXX. */
export interface Profile {
  name: string;
  phone: string;
}

const profileRowsSchema = z.array(
  z.object({ name: z.nullable(z.string()), phone: z.nullable(z.string()) }),
);

/** The signed-in account's own name and number. Needs signal: Profile has nothing to show without it. */
export async function fetchProfile(): Promise<Profile> {
  let client;
  try {
    client = await requireClient();
  } catch (error) {
    if (error instanceof UploadError && error.problem === 'offline') {
      throw new AccountError('offline', error.message);
    }
    throw new AccountError('unavailable', String(error));
  }
  // TODO: typed rpc once 01 is applied and database types are regenerated.
  const untyped: SupabaseClient = client;
  const { data, error, status } = await untyped.rpc('get_profile');
  if (error) {
    if (status === 0) throw new AccountError('offline', error.message);
    console.warn(`ParaPo did not give the profile (HTTP ${status}):`, error.message);
    throw new AccountError('not-accepting', error.message);
  }
  const rows = profileRowsSchema.safeParse(data);
  if (!rows.success)
    throw new AccountError('not-accepting', 'The profile is not in the form expected.');
  return { name: rows.data[0]?.name ?? '', phone: rows.data[0]?.phone ?? '' };
}
