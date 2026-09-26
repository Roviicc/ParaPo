import * as THREE from 'three'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { buildCommuter, type ModelPose } from './commuterModel'
import type { Pose } from '../useWhereAmI'

/*
 * The walker drawn live in 3D, for the `?figure=3d` experiment. A small
 * WebGL canvas inside the walker's DOM marker, not a map layer: the map
 * never repaints for it, and only this canvas (130 × 100 px) is redrawn:
 * 30 times a second on the move, 15 while standing (breathing needs no
 * more), and never while the page is hidden.
 *
 * What it adds over the sprite sheet: the figure faces the heading itself,
 * not the nearest of four, turns as the map rotates, looks down at it from
 * higher as the map tilts, and moves smoothly between standing, walking and
 * flying.
 */

/** CSS pixels. The feet sit BASELINE px above the canvas's bottom edge. */
export const CANVAS_W = 130
export const CANVAS_H = 100
const BASELINE = 10
/** CSS pixels per model unit: about 58 px tall, the sprite's height. */
const PPU = 56
const FRAME_MS = { moving: 1000 / 30, standing: 1000 / 15 }

export type LiveState = { pose: Pose; speed: number; heading: number | null }

export type LiveFigure = {
  update(state: LiveState): void
  dispose(): void
}

const MODEL_POSE: Record<Pose, ModelPose> = { standing: 'stand', walking: 'walk', flying: 'fly' }

/** Smallest signed angle from a to b, radians. */
const turnTo = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

/** Throws when the browser gives no WebGL; the caller keeps the sprite then. */
export function mountLiveFigure(canvas: HTMLCanvasElement, map: MapLibreMap): LiveFigure {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(CANVAS_W, CANVAS_H, false)
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const w = CANVAS_W / PPU, h = CANVAS_H / PPU, base = BASELINE / PPU
  const camera = new THREE.OrthographicCamera(-w / 2, w / 2, h - base, -base, 0.1, 50)
  scene.add(camera)
  scene.add(new THREE.HemisphereLight(0xfff0e0, 0x3a3234, 2.2))
  // Lights ride with the camera, so the side facing the viewer is always lit.
  const light = (color: number, intensity: number, x: number, y: number, z: number) => {
    const l = new THREE.DirectionalLight(color, intensity)
    l.position.set(x, y, z)
    camera.add(l)
  }
  light(0xfff4ea, 2.4, -2, 3, 0)
  light(0xfff6ee, 0.8, 2, 0.5, 0)
  light(0xffa860, 1.6, -2, 1.5, -12)
  light(0xffb070, 0.9, 2.5, 1, -12)

  const model = buildCommuter()
  scene.add(model.object)

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let state: LiveState = { pose: 'standing', speed: 0, heading: null }
  let yaw = 0 // 0 faces the viewer
  let phase = Math.PI / 2
  let clock = 0
  let last = 0
  let raf = 0

  /** Where the figure should face, in the screen's terms. */
  const targetYaw = () => {
    if (state.heading === null) return yaw
    // Heading on the screen: 0 is up the screen, clockwise.
    const screen = ((state.heading - map.getBearing()) * Math.PI) / 180
    // Flying is a side view, like the sprite: right for anything eastward on screen.
    if (state.pose === 'flying') return Math.sin(screen) >= 0 ? Math.PI / 2 : -Math.PI / 2
    return Math.PI - screen
  }

  const aim = () => {
    // A three-quarter view from above, higher as the map tilts.
    const pitch = Math.min(1.05, 0.32 + ((map.getPitch() * Math.PI) / 180) * 0.6)
    camera.position.set(0, 10 * Math.sin(pitch), 10 * Math.cos(pitch))
    camera.lookAt(0, 0, 0)
  }

  const draw = () => {
    aim()
    model.object.rotation.y = yaw
    renderer.render(scene, camera)
  }

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    if (now - last < (state.pose === 'standing' ? FRAME_MS.standing : FRAME_MS.moving) - 2) return
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = now
    clock += dt
    const kmh = state.speed * 3.6
    if (state.pose === 'walking') phase += Math.PI * (1.5 + Math.min(kmh, 12) * 0.12) * dt
    yaw += turnTo(yaw, targetYaw()) * (1 - Math.exp(-dt * 8))
    model.step(MODEL_POSE[state.pose], phase, clock, dt)
    draw()
  }

  // With reduced motion: a still figure, redrawn only when something changes.
  const redrawStill = () => {
    yaw = targetYaw()
    model.set(MODEL_POSE[state.pose], Math.PI / 2, 0)
    draw()
  }
  if (still) {
    map.on('rotate', redrawStill)
    map.on('pitch', redrawStill)
    redrawStill()
  } else {
    raf = requestAnimationFrame(frame)
  }

  return {
    update(next) {
      state = next
      if (still) redrawStill()
    },
    dispose() {
      cancelAnimationFrame(raf)
      map.off('rotate', redrawStill)
      map.off('pitch', redrawStill)
      model.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
