import { useEffect, useRef } from 'react'
import type { MapLibreMap } from 'maplibre-gl'

/*
 * The layers that draw only what is lit or marked, switched off as a whole
 * while nothing is (the cheap-phone plan, step 18, 2026-10-04): the lit
 * routes' casing and copy, their orange stretches, and the hotspots'
 * siblings and stripes.
 *
 * Each holds every direction or box, at opacity 0 unless its feature state
 * lights it: a filter naming the lit ones would lay the source out again at
 * every tap (useLighting, savedRoutesLayers.ts). So at rest they drew every
 * tile's worth of nothing, every frame: seven draw calls a tile. MapLibre
 * 6.7's layer opacity (`line-layer-opacity`, `fill-layer-opacity`) at 0
 * returns before a single one (draw_line.ts, draw_fill.ts), and at 1 draws
 * the layer exactly as without it: the pass through a texture of its own
 * is for the values between, which a 0 ms transition never shows. Unlike
 * `visibility`, it leaves the layer to the worker's layout, so switching
 * it on lays nothing out again; and like the feature state, it reaches the
 * screen in the next frame drawn, so the two change together.
 *
 * A layer's GL program is compiled the first time it draws. So each starts
 * on, and switches only after the map's first 'idle' since its source had
 * its data: the frames before drew it, nothing lit, and compiled its
 * program as the map loaded, as before, and a tap compiles none (step 3;
 * the suites' program checks). The same after a lost GL context is given
 * back, its programs gone with it: on, till the next 'idle'.
 *
 * Each change of the value asks the map for a frame. On goes at once, with
 * the lighting that needs it; so does off when the lighting goes, a frame
 * the feature state draws anyway. But off as the map is first idle with
 * nothing lit would be a frame of its own, the whole map drawn again for
 * pixels that do not change: at 1,280 × 800 with 5,000 directions
 * (studio-scale-test) 1.4-1.7 s of SwiftShader each, two in an opening. So
 * that waits for the map's next move, whose frames come anyway and are the
 * ones it saves; a still map draws no frames to save.
 */

/** As much of a map as a switch uses: a unit check hands it a stand-in. */
export type SwitchMap = Pick<MapLibreMap, 'getLayer' | 'getPaintProperty' | 'setPaintProperty'>

/**
 * One switch over `layers`: on while anything they draw is lit (`set`),
 * and off with nothing once `warm`, the map whose idle came since its data
 * was in. Each layer's own type names its property; a layer not on the map
 * is passed over, and one already as wanted is left alone (each set asks
 * the map for a frame). The value is read off the map, not kept: a basemap
 * switch carries the layers across with theirs (basemap.ts). Set when what
 * is lit comes or goes, when the map starts to move (`moved`), and on again
 * at once when the map's programs are lost; never at the warm idle itself.
 */
export class LayerSwitch {
  readonly layers: readonly string[]
  on = false
  warm: SwitchMap | null = null
  constructor(layers: readonly string[]) {
    this.layers = layers
  }

  /** What is lit or marked now: anything, or nothing. Applied only when that changes, with the feature state that changes with it. */
  set(map: SwitchMap, on: boolean): void {
    if (on === this.on) return
    this.on = on
    this.apply(map)
  }

  /**
   * `map`'s first 'idle' since the data was in has come (true): off from the
   * next move. Or its GL context is back without its programs (false): on
   * at once, so the frames to come compile them.
   */
  warmed(map: SwitchMap, warm: boolean): void {
    this.warm = warm ? map : null
    if (!warm) this.apply(map)
  }

  /** `map` starts to move: what is to be off goes off, in the frames the move draws. */
  moved(map: SwitchMap): void {
    this.apply(map)
  }

  /** The opacity the layers have on `map` now: 1, but 0 when warm and nothing is lit. */
  value(map: SwitchMap): 0 | 1 {
    return this.warm === map && !this.on ? 0 : 1
  }

  apply(map: SwitchMap): void {
    const value = this.value(map)
    for (const id of this.layers) {
      const layer = map.getLayer(id)
      if (!layer) continue
      const name = `${layer.type}-layer-opacity` as 'line-layer-opacity'
      if ((map.getPaintProperty(id, name) ?? 1) !== value) map.setPaintProperty(id, name, value)
    }
  }
}

/**
 * A switch over `layers` (a constant list) on `map`, warmed by the map's
 * first 'idle' once `primed` — its source has its data — and again after a
 * lost GL context is given back. The hook that lights the layers calls
 * `set` in the effect that sets their feature state. A basemap switch needs
 * nothing of it: the layers ride across with their paint (basemap.ts).
 */
export function useLayerSwitch(map: MapLibreMap | null, layers: readonly string[], primed: boolean): LayerSwitch {
  const kept = useRef<LayerSwitch | null>(null)
  kept.current ??= new LayerSwitch(layers)
  const sw = kept.current
  useEffect(() => {
    if (!map || !primed) return
    const warm = () => sw.warmed(map, true)
    // The programs went with the context: on, so the next frames compile
    // them again, and off at the next 'idle'. MapLibre makes the style
    // afresh from its own copy a frame after the context is back, these
    // layers at the opacity they had then, so a style's load is where
    // they get the switch's value: no 'idle' comes before it.
    const restored = () => {
      sw.warmed(map, false)
      map.off('idle', warm)
      map.once('idle', warm)
    }
    const loaded = () => sw.apply(map)
    const moved = () => sw.moved(map)
    if (sw.warm !== map) map.once('idle', warm)
    map.on('webglcontextrestored', restored)
    map.on('style.load', loaded)
    map.on('movestart', moved)
    return () => {
      map.off('idle', warm)
      map.off('webglcontextrestored', restored)
      map.off('style.load', loaded)
      map.off('movestart', moved)
    }
  }, [map, primed, sw])
  return sw
}
