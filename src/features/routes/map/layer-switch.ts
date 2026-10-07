import { useEffect, useRef } from 'react'
import type { LayerSpecification, MapLibreMap } from 'maplibre-gl'
import { warmSoon, type Twin } from './warm-programs'

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
 * Off from the start: each layer is added at 0 (its paint says so), and
 * nothing is ever lit as a map opens. Until 2026-10-05 they started on and
 * went off from the first move after the map's first 'idle', so that the
 * opening's frames, which drew them with nothing lit, compiled their GL
 * programs before any tap (step 3). Every frame of an opening drew them
 * then, and an opening of many directions is many frames of the whole map:
 * in the suites' maps of 5,000 directions at 1,280 x 800 on SwiftShader,
 * 0.5-1.7 s each (timed in the page, 2026-10-05). Their programs are
 * compiled by twins instead, as the end circles' are: each layer's type and
 * paint over a speck of its own, drawn once while the map is idle
 * (warmPrograms.ts, warmSoon), which the switch asks for once its layers
 * are on the map, and again once a lost GL context is given back. A tap
 * compiles none (the suites' program checks), and the pixels are the same:
 * with nothing lit, the layers drew nothing to see (review of the sources
 * group, 2026-10-05).
 */

/** As much of a map as a switch uses: a unit check hands it a stand-in. */
export type SwitchMap = Pick<MapLibreMap, 'getLayer' | 'getPaintProperty' | 'setPaintProperty'>

/** A layer's property that switches it, by its type: `line-layer-opacity` or `fill-layer-opacity`. */
const switchOf = (type: string) => `${type}-layer-opacity` as 'line-layer-opacity'

/**
 * One switch over `layers`: on while anything they draw is lit (`set`), off
 * while nothing is. Each layer's own type names its property; a layer not on
 * the map is passed over, and one already as wanted is left alone (each set
 * asks the map for a frame). The value is read off the map, not kept: a
 * basemap switch carries the layers across with theirs (basemap.ts), and a
 * style made afresh after a lost GL context has it put back at its load.
 */
export class LayerSwitch {
  readonly layers: readonly string[]
  on = false
  constructor(layers: readonly string[]) {
    this.layers = layers
  }

  /** What is lit or marked now: anything, or nothing. Applied only when that changes, with the feature state that changes with it. */
  set(map: SwitchMap, on: boolean): void {
    if (on === this.on) return
    this.on = on
    this.apply(map)
  }

  /** The opacity the layers have now: 1 while anything is lit, 0 while nothing is. */
  value(): 0 | 1 {
    return this.on ? 1 : 0
  }

  apply(map: SwitchMap): void {
    const value = this.value()
    for (const id of this.layers) {
      const layer = map.getLayer(id)
      if (!layer) continue
      const name = switchOf(layer.type)
      if ((map.getPaintProperty(id, name) ?? 1) !== value) map.setPaintProperty(id, name, value)
    }
  }
}

/** As much of a map as twinsOf reads: its layers, as MapLibre serializes them. */
type TwinMap = { getLayer: (id: string) => { serialize?: () => LayerSpecification } | undefined }

/**
 * A twin of each of `layers` on `map`: its type and paint as they are now,
 * but for the switch and its transition, so that it draws (at 1, as the
 * layer draws when lit) and by the layer's own GL program, a program being
 * keyed on the type and on which paint varies by feature or zoom
 * (gl-programs-test). Each paint here reads the feature state to show
 * anything, and a twin's speck has none: unseen. A layer not on the map
 * has none.
 */
export function twinsOf(map: TwinMap, layers: readonly string[]): Twin[] {
  return layers.flatMap((id) => {
    const layer = map.getLayer(id)
    const spec = (typeof layer?.serialize === 'function' ? layer.serialize() : layer) as LayerSpecification | undefined
    if (!spec || !('paint' in spec)) return []
    const paint = Object.fromEntries(Object.entries(spec.paint ?? {}).filter(([k]) => !/-layer-opacity(-transition)?$/.test(k)))
    return [{ type: spec.type, paint } as Twin]
  })
}

/**
 * A switch over `layers` (a constant list) on `map`, once they are on it
 * (`added`): their programs compiled by twins at the map's next warm-up,
 * and again after a lost GL context is given back, and the switch's value
 * put back at each style's load. The hook that lights the layers calls
 * `set` in the effect that sets their feature state. A basemap switch
 * needs nothing of it: the layers ride across with their paint (basemap.ts).
 */
export function useLayerSwitch(map: MapLibreMap | null, layers: readonly string[], added: boolean): LayerSwitch {
  const kept = useRef<LayerSwitch | null>(null)
  kept.current ??= new LayerSwitch(layers)
  const sw = kept.current
  const warmed = useRef<MapLibreMap | null>(null)
  useEffect(() => {
    if (!map || !added) return
    const twins = () => {
      warmed.current = map
      return twinsOf(map as unknown as TwinMap, sw.layers)
    }
    // Once a map: the programs stay with its GL context.
    let cancel = warmed.current === map ? () => {} : warmSoon(map, twins)
    // The programs went with the context; MapLibre makes the style afresh
    // from its own copy a frame after the context is back, these layers at
    // the opacity they had then, so a style's load is where they get the
    // switch's value.
    const restored = () => {
      cancel()
      cancel = warmSoon(map, twins)
    }
    const loaded = () => sw.apply(map)
    map.on('webglcontextrestored', restored)
    map.on('style.load', loaded)
    return () => {
      cancel()
      map.off('webglcontextrestored', restored)
      map.off('style.load', loaded)
    }
  }, [map, added, sw])
  return sw
}
