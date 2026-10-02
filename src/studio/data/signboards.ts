import { cleanSignboardSvg } from '../../shared/model/signboardSvg'
import { getSupabase, supabaseConfig } from './supabase'

/**
 * A direction's signboards, as the editor uploads them (0010, the owner's ask
 * of 2026-10-01): SVG files in the `signboards` bucket, named by a fresh uuid
 * each, and the direction's `signboards` column listing them in order. The
 * publish copies them beside the map (scripts/publish/publish-map.mjs).
 *
 * Each file is cleaned before it is sent (signboardSvg.ts): what reaches the
 * bucket is drawing only. Order of writes, so nothing is left pointing at a
 * missing file: an upload sends the file and then lists it; a removal
 * unlists it and then deletes the file, and a file left behind by a delete
 * that failed is only an unlisted file, which the publish never reads.
 */

const BUCKET = 'signboards'

/** Where a board is read in the studio: the bucket's public address. */
export function signboardUrl(name: string): string {
  return `${supabaseConfig?.url ?? ''}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(name)}`
}

/** The direction's list, written as given; the new list back. */
async function writeList(variantId: string, names: readonly string[]): Promise<string[]> {
  const client = getSupabase()
  if (!client) throw new Error('Supabase is not configured.')
  const { data, error } = await client.from('route_variant').update({ signboards: names }).eq('id', variantId).select('signboards').single()
  if (error) throw new Error(`The signboards were not saved: ${error.message}`)
  return (data as { signboards: string[] }).signboards
}

/** A file cleaned and sent, then put last in the direction's list. */
export async function addSignboard(variantId: string, current: readonly string[], file: File): Promise<string[]> {
  const client = getSupabase()
  if (!client) throw new Error('Supabase is not configured.')
  if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') throw new Error(`${file.name} is not an SVG file.`)
  const clean = cleanSignboardSvg(await file.text())
  if ('error' in clean) throw new Error(`${file.name}: ${clean.error}`)
  const name = `${crypto.randomUUID()}.svg`
  const { error } = await client.storage
    .from(BUCKET)
    .upload(name, new Blob([clean.svg], { type: 'image/svg+xml' }), { contentType: 'image/svg+xml', upsert: false })
  if (error) throw new Error(`${file.name} was not uploaded: ${error.message}`)
  return writeList(variantId, [...current, name])
}

/** A board taken off the direction, and its file deleted after. */
export async function removeSignboard(variantId: string, current: readonly string[], name: string): Promise<string[]> {
  const client = getSupabase()
  if (!client) throw new Error('Supabase is not configured.')
  const next = await writeList(variantId, current.filter((n) => n !== name))
  await client.storage.from(BUCKET).remove([name])
  return next
}

/** A board one place earlier in the list. */
export function moveSignboardEarlier(variantId: string, current: readonly string[], name: string): Promise<string[]> {
  const i = current.indexOf(name)
  if (i < 1) return Promise.resolve([...current])
  const next = [...current]
  ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
  return writeList(variantId, next)
}
