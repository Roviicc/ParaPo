/** Why the map might be failing, answered from inside the browser. */
export type Diagnosis = {
  webgl: 'webgl2' | 'webgl' | 'none'
  renderer: string | null
  styleFetch: string
}

function probeWebGL(): Pick<Diagnosis, 'webgl' | 'renderer'> {
  const canvas = document.createElement('canvas')

  const gl2 = canvas.getContext('webgl2')
  const gl = gl2 ?? canvas.getContext('webgl')
  if (!gl) return { webgl: 'none', renderer: null }

  let renderer: string | null = null
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (ext) renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string
  } catch {
    /* fingerprint-blocked; not fatal */
  }

  return { webgl: gl2 ? 'webgl2' : 'webgl', renderer }
}

/** Fetch the style the same way MapLibre would, and report what happens. */
async function probeStyle(url: string): Promise<string> {
  const started = performance.now()
  try {
    const res = await fetch(url)
    const ms = Math.round(performance.now() - started)
    if (!res.ok) return `HTTP ${res.status} after ${ms}ms`
    const text = await res.text()
    return `HTTP ${res.status}, ${text.length} bytes in ${ms}ms`
  } catch (err) {
    const ms = Math.round(performance.now() - started)
    return `fetch threw after ${ms}ms: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function diagnose(styleUrl: string): Promise<Diagnosis> {
  return { ...probeWebGL(), styleFetch: await probeStyle(styleUrl) }
}
