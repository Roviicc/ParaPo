import * as THREE from 'three'

/*
 * The walker as a 3D model: the chibi commuter of
 * docs/figure/commuter-reference.png, built from primitives so there is no
 * model file to load. The same figure as docs/figure/commuter-3d.html, which
 * renders the sprite sheet; change one, change the other.
 *
 * About 1 unit tall, feet at y = 0, facing +z. A positive x-rotation swings
 * a limb backwards.
 */

export type ModelPose = 'stand' | 'walk' | 'fly'

type Angles = {
  y: number
  lean: number
  turn: number
  headX: number
  headY: number
  headZ: number
  hipL: number
  hipR: number
  kneeL: number
  kneeR: number
  footL: number
  footR: number
  shL: number
  shR: number
  outL: number
  outR: number
  elL: number
  elR: number
  bag: number
}

const HIP_Y = 0.3
const BASE: Angles = {
  y: HIP_Y, lean: 0, turn: 0, headX: 0, headY: 0, headZ: 0, hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, footL: 0, footR: 0,
  shL: 0.05, shR: 0.05, outL: 0.14, outR: 0.14, elL: -0.15, elR: -0.15, bag: -0.05,
}
const KEYS = Object.keys(BASE) as (keyof Angles)[]

/** Joint angles for a pose at time t (seconds, or the step phase for walking). */
function anglesFor(pose: ModelPose, t: number): Angles {
  if (pose === 'walk') {
    const a = 0.54, s = Math.sin(t)
    return {
      ...BASE,
      y: HIP_Y - 0.004 + Math.abs(Math.cos(t)) * 0.018, lean: 0.05, turn: s * 0.08, headX: -0.03, headZ: -s * 0.03,
      hipL: -a * s, hipR: a * s,
      kneeL: Math.max(0, Math.sin(t - 1.2)) * 0.9 + 0.05, kneeR: Math.max(0, Math.sin(t + Math.PI - 1.2)) * 0.9 + 0.05,
      footL: -Math.max(0, -s) * 0.2, footR: -Math.max(0, s) * 0.2,
      shL: a * 1.1 * s, shR: -a * 1.1 * s, outL: 0.12, outR: 0.12, elL: -0.45, elR: -0.45,
      bag: -0.05 - Math.sin(t * 2 - 0.8) * 0.06,
    }
  }
  if (pose === 'fly') {
    // Like a superhero: body level, one arm ahead, the other back, legs together.
    const b = Math.sin(t * 5)
    return {
      ...BASE,
      lean: 1.35, headX: -0.95, hipL: 0.1 + b * 0.05, hipR: -0.02 - b * 0.05, kneeL: 0.35, kneeR: 0.12, footL: 0.4, footR: 0.3,
      shL: -2.55, outL: 0.3, elL: -0.05, shR: 0.45, outR: 0.3, elR: -0.25, bag: 0.05 + b * 0.04,
    }
  }
  // Breathing, and now and then a glance to the side.
  const b = Math.sin(t * 1.4)
  const glance = Math.sin(t * 0.37) * Math.max(0, Math.sin(t * 0.37 + 1)) * 0.45
  return { ...BASE, y: HIP_Y + b * 0.003, headY: glance, headZ: Math.sin(t * 0.5) * 0.04, shL: 0.05 + b * 0.02, shR: 0.05 - b * 0.02 }
}

export type CommuterModel = {
  object: THREE.Group
  /** Blend towards `pose` over dt seconds; `phase` drives the walk cycle, `clock` everything else. */
  step(pose: ModelPose, phase: number, clock: number, dt: number): void
  /** Jump straight to a pose, for a still frame. */
  set(pose: ModelPose, phase: number, clock: number): void
  dispose(): void
}

export function buildCommuter(): CommuterModel {
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []

  // A soft warm rim on every lit material, the glow the reference sheet has.
  const lit = (color: number, roughness = 0.78, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness })
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        'float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6);\n' +
          'gl_FragColor.rgb += vec3(1.0, 0.62, 0.32) * rimF * 0.18;\n#include <dithering_fragment>',
      )
    }
    materials.push(m)
    return m
  }
  const flat = (params: THREE.MeshBasicMaterialParameters) => {
    const m = new THREE.MeshBasicMaterial(params)
    materials.push(m)
    return m
  }
  const skin = lit(0xf0b38c, 0.7)
  const tee = lit(0xf3f1ec)
  const pants = lit(0x25262d)
  const shoeMat = lit(0xf5f5f2, 0.6)
  const soleMat = lit(0xc9c7c3)
  const capMat = lit(0x2c2f3a, 0.85)
  const hairMat = lit(0x3a2921, 0.9)
  const packMat = lit(0x2a2b31, 0.8)
  const eyeMat = lit(0x17151a, 0.3)
  const phoneMat = lit(0x1b1c21, 0.4, 0.2)
  const whiteMat = flat({ color: 0xffffff })
  const screenMat = flat({ color: 0x7cc6ff })
  const blushMat = flat({ color: 0xf08a7a, transparent: true, opacity: 0.35, depthWrite: false })
  const lineMat = flat({ color: 0x3aa0ff })

  type V3 = [number, number, number]
  const geo = <G extends THREE.BufferGeometry>(g: G) => (geometries.push(g), g)
  const mesh = (g: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, pos?: V3, scale?: V3 | null, rot?: V3) => {
    const m = new THREE.Mesh(g, mat)
    if (pos) m.position.set(...pos)
    if (scale) m.scale.set(...scale)
    if (rot) m.rotation.set(...rot)
    parent.add(m)
    return m
  }
  // Shared shapes: the figure is ~50 px tall on the map, so modest segment counts.
  const sphereCache = new Map<string, THREE.SphereGeometry>()
  const sphere = (r: number, w = 20, h = 14) => {
    const k = `${r}/${w}/${h}`
    let g = sphereCache.get(k)
    if (!g) sphereCache.set(k, (g = geo(new THREE.SphereGeometry(r, w, h))))
    return g
  }
  const cyl = (rt: number, rb: number, h: number) => geo(new THREE.CylinderGeometry(rt, rb, h, 16))

  const figure = new THREE.Group()
  const root = new THREE.Group()
  root.position.y = HIP_Y
  figure.add(root)

  // Torso: pants at the hips, a rounded white tee above.
  mesh(sphere(0.125), pants, root, [0, 0, 0], [1, 0.6, 0.9])
  mesh(cyl(0.118, 0.13, 0.2), tee, root, [0, 0.11, 0], [1, 1, 0.88])
  mesh(sphere(0.118), tee, root, [0, 0.21, 0], [1, 0.45, 0.88])
  mesh(cyl(0.132, 0.132, 0.025), tee, root, [0, 0.02, 0], [1, 1, 0.9])

  // Backpack, in its own group so it can swing, and its straps.
  const bagShape = new THREE.Shape()
  const bw = 0.2, bh = 0.22, br = 0.05
  bagShape.moveTo(-bw / 2 + br, -bh / 2)
  bagShape.lineTo(bw / 2 - br, -bh / 2); bagShape.quadraticCurveTo(bw / 2, -bh / 2, bw / 2, -bh / 2 + br)
  bagShape.lineTo(bw / 2, bh / 2 - br); bagShape.quadraticCurveTo(bw / 2, bh / 2, bw / 2 - br, bh / 2)
  bagShape.lineTo(-bw / 2 + br, bh / 2); bagShape.quadraticCurveTo(-bw / 2, bh / 2, -bw / 2, bh / 2 - br)
  bagShape.lineTo(-bw / 2, -bh / 2 + br); bagShape.quadraticCurveTo(-bw / 2, -bh / 2, -bw / 2 + br, -bh / 2)
  const pack = new THREE.Group()
  pack.position.set(0, 0.22, -0.14)
  root.add(pack)
  mesh(geo(new THREE.ExtrudeGeometry(bagShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 6 })), packMat, pack, [0, -0.1, -0.06])
  mesh(geo(new THREE.ExtrudeGeometry(bagShape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 4 })), packMat, pack, [0, -0.15, -0.105], [0.72, 0.4, 1])
  mesh(geo(new THREE.TorusGeometry(0.022, 0.007, 6, 12, Math.PI)), packMat, pack, [0, 0.03, -0.03])
  const strapArc = geo(new THREE.TorusGeometry(0.085, 0.011, 6, 14, Math.PI))
  const strap = geo(new THREE.BoxGeometry(0.022, 0.12, 0.014))
  for (const s of [-1, 1]) {
    mesh(strapArc, packMat, root, [s * 0.075, 0.19, -0.03], null, [0, Math.PI / 2, 0])
    mesh(strap, packMat, root, [s * 0.075, 0.13, 0.108], null, [-0.14, 0, 0])
  }

  // Head
  const neck = new THREE.Group()
  neck.position.y = 0.24
  root.add(neck)
  const headR = 0.23
  const head = new THREE.Group()
  head.position.y = 0.22
  neck.add(head)
  mesh(sphere(headR, 32, 22), skin, head, [0, 0, 0], [1.04, 0.96, 1])
  for (const s of [-1, 1]) mesh(sphere(0.036), skin, head, [s * 0.226, -0.06, -0.015], [0.5, 1, 0.85])

  // Hair: a shell over the back and sides, and teardrop locks.
  mesh(geo(new THREE.SphereGeometry(headR + 0.012, 32, 20, Math.PI * 0.86, Math.PI * 1.28, 0, Math.PI * 0.64)), hairMat, head, [0, 0.005, -0.004], [1.04, 0.97, 1.01])
  const lockGeo = geo(new THREE.LatheGeometry(
    [[0, -1], [0.18, -0.88], [0.38, -0.62], [0.5, -0.32], [0.46, -0.1], [0.3, 0.02], [0, 0.06]].map(([x, y]) => new THREE.Vector2(x, y)),
    12,
  ))
  const lock = (pos: V3, size: V3, rot: V3) => mesh(lockGeo, hairMat, head, pos, size, rot)
  for (const [x, len, tilt] of [[-0.16, 0.07, -0.5], [-0.08, 0.085, -0.2], [0.005, 0.09, 0.08], [0.09, 0.08, 0.3], [0.165, 0.068, 0.55]]) {
    const z = Math.sqrt(Math.max(0, headR * headR - x * x - 0.07 * 0.07)) - 0.015
    lock([x, 0.062, z], [0.11, len, 0.055], [-0.45, 0, tilt])
  }
  for (const s of [-1, 1]) {
    lock([s * 0.212, 0.07, 0.015], [0.075, 0.11, 0.055], [-0.05, 0, s * 0.18])
    lock([s * 0.215, 0.06, -0.06], [0.09, 0.12, 0.07], [0.1, 0, s * 0.22])
  }
  for (const [x, tilt] of [[-0.11, -0.3], [0, 0], [0.11, 0.3]]) lock([x, 0, -0.195], [0.14, 0.12, 0.07], [0.5, 0, tilt])

  // Cap: crown, a curved brim, a button.
  const cap = new THREE.Group()
  cap.position.set(0, 0.078, -0.012)
  cap.rotation.x = -0.14
  head.add(cap)
  mesh(geo(new THREE.SphereGeometry(headR + 0.03, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.53)), capMat, cap, [0, 0, 0], [1.05, 0.98, 1.04])
  const brimShape = new THREE.Shape()
  brimShape.moveTo(-0.235, 0)
  brimShape.absellipse(0, 0, 0.235, 0.36, Math.PI, 0, true, 0)
  brimShape.lineTo(-0.235, 0)
  const brimGeo = geo(new THREE.ExtrudeGeometry(brimShape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1, curveSegments: 20 }))
  brimGeo.rotateX(Math.PI / 2)
  // The sides droop, as a worn cap's do.
  const bp = brimGeo.attributes.position
  for (let i = 0; i < bp.count; i++) bp.setY(i, bp.getY(i) - 1.6 * bp.getX(i) * bp.getX(i) * Math.min(1, bp.getZ(i) / 0.25 + 0.4))
  brimGeo.computeVertexNormals()
  const brim = new THREE.Group()
  brim.position.set(0, -0.018, 0)
  brim.rotation.x = 0.04
  cap.add(brim)
  mesh(brimGeo, capMat, brim)
  mesh(sphere(0.022), capMat, cap, [0, headR + 0.02, 0], [1, 0.5, 1])

  // Eyes with a highlight, which blink; a little blush.
  const eyes: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const e = new THREE.Group()
    e.position.set(s * 0.098, -0.045, 0.188)
    e.rotation.y = s * 0.48
    head.add(e)
    mesh(sphere(0.035), eyeMat, e, [0, 0, 0], [0.8, 1.3, 0.45])
    mesh(sphere(0.011, 8, 6), whiteMat, e, [0.009, 0.019, 0.013])
    eyes.push(e)
  }
  const blush = geo(new THREE.CircleGeometry(0.028, 12))
  for (const s of [-1, 1]) mesh(blush, blushMat, head, [s * 0.13, -0.085, 0.178], [1, 0.6, 1], [0, s * 0.62, 0])

  // Arms: short sleeve, forearm, round hand.
  const arm = (side: number) => {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * 0.145, 0.2, 0)
    root.add(shoulder)
    mesh(sphere(0.052), tee, shoulder, [0, -0.01, 0])
    mesh(cyl(0.05, 0.048, 0.075), tee, shoulder, [0, -0.045, 0])
    mesh(cyl(0.036, 0.034, 0.05), skin, shoulder, [0, -0.095, 0])
    const elbow = new THREE.Group()
    elbow.position.y = -0.115
    shoulder.add(elbow)
    mesh(sphere(0.035), skin, elbow)
    mesh(cyl(0.034, 0.032, 0.07), skin, elbow, [0, -0.04, 0])
    const hand = new THREE.Group()
    hand.position.y = -0.09
    elbow.add(hand)
    mesh(sphere(0.043), skin, hand, [0, 0, 0], [0.9, 1, 0.85])
    return { shoulder, elbow, hand }
  }
  const armL = arm(1), armR = arm(-1)

  // A phone in the right hand.
  const phone = new THREE.Group()
  phone.position.set(-0.01, -0.035, 0.03)
  armR.hand.add(phone)
  mesh(geo(new THREE.BoxGeometry(0.052, 0.095, 0.012)), phoneMat, phone)
  mesh(geo(new THREE.PlaneGeometry(0.044, 0.085)), screenMat, phone, [0, 0, 0.0065])

  // Legs: pants, then white sneakers.
  const leg = (side: number) => {
    const hip = new THREE.Group()
    hip.position.set(side * 0.065, 0, 0)
    root.add(hip)
    mesh(cyl(0.06, 0.056, 0.14), pants, hip, [0, -0.065, 0])
    const knee = new THREE.Group()
    knee.position.y = -0.13
    hip.add(knee)
    mesh(sphere(0.056), pants, knee)
    mesh(cyl(0.056, 0.058, 0.1), pants, knee, [0, -0.055, 0])
    const foot = new THREE.Group()
    foot.position.y = -0.12
    knee.add(foot)
    mesh(sphere(0.06), shoeMat, foot, [0, 0, 0.03], [1.05, 0.72, 1.55])
    mesh(cyl(0.062, 0.062, 0.018), soleMat, foot, [0, -0.037, 0.03], [1.02, 1, 1.52])
    return { hip, knee, foot }
  }
  const legL = leg(1), legR = leg(-1)

  // Speed lines behind the feet, shown while flying.
  const speedLines = new THREE.Group()
  for (const [y, z, len] of [[0.47, -0.62, 0.3], [0.33, -0.72, 0.42], [0.19, -0.64, 0.28]]) {
    mesh(geo(new THREE.CylinderGeometry(0.014, 0.014, len, 8)), lineMat, speedLines, [0, y, z], null, [Math.PI / 2, 0, 0])
  }
  figure.add(speedLines)

  // ---------- posing ----------
  const current: Angles = { ...BASE }
  const weights: Record<ModelPose, number> = { stand: 1, walk: 0, fly: 0 }
  const tmp = new THREE.Vector3()
  let nextBlink = 2.5
  let blinkAt = -1

  const apply = (p: Angles, clock: number) => {
    root.position.y = p.y
    root.rotation.set(p.lean, p.turn, 0)
    neck.rotation.set(p.headX, p.headY - p.turn * 0.6, p.headZ)
    legL.hip.rotation.x = p.hipL; legR.hip.rotation.x = p.hipR
    legL.knee.rotation.x = p.kneeL; legR.knee.rotation.x = p.kneeR
    legL.foot.rotation.x = p.footL - p.lean * 0.5; legR.foot.rotation.x = p.footR - p.lean * 0.5
    armL.shoulder.rotation.set(p.shL, 0, p.outL); armR.shoulder.rotation.set(p.shR, 0, -p.outR)
    armL.elbow.rotation.x = p.elL; armR.elbow.rotation.x = p.elR
    pack.rotation.x = p.bag
    speedLines.visible = weights.fly > 0.5
    // Stand the lowest sole on the ground; in flight, hang in the air and bob.
    figure.position.y = 0
    figure.updateMatrixWorld(true)
    const sole = (l: typeof legL) => (l.foot.getWorldPosition(tmp), tmp.y - 0.045)
    const grounded = -Math.min(sole(legL), sole(legR))
    const flying = 0.28 + Math.sin(clock * 5.2) * 0.04
    figure.position.y = grounded * (1 - weights.fly) + flying * weights.fly
  }

  const blend = (phase: number, clock: number) => {
    const out = { ...BASE }
    for (const k of KEYS) out[k] = 0
    let total = 0
    for (const pose of ['stand', 'walk', 'fly'] as const) {
      const w = weights[pose]
      if (w < 0.001) continue
      const a = anglesFor(pose, pose === 'walk' ? phase : clock)
      for (const k of KEYS) out[k] += a[k] * w
      total += w
    }
    for (const k of KEYS) out[k] /= total || 1
    return out
  }

  return {
    object: figure,
    step(pose, phase, clock, dt) {
      const toward = 1 - Math.exp(-dt * 7)
      for (const p of ['stand', 'walk', 'fly'] as const) weights[p] += ((p === pose ? 1 : 0) - weights[p]) * toward
      const target = blend(phase, clock)
      const follow = 1 - Math.exp(-dt * 16)
      for (const k of KEYS) current[k] += (target[k] - current[k]) * follow
      apply(current, clock)
      // Blink every few seconds.
      if (clock > nextBlink) { blinkAt = clock; nextBlink = clock + 2.5 + Math.random() * 2.5 }
      const since = clock - blinkAt
      const open = blinkAt < 0 || since > 0.14 ? 1 : Math.max(0.08, Math.abs(since - 0.07) / 0.07)
      for (const e of eyes) e.scale.y = open
    },
    set(pose, phase, clock) {
      for (const p of ['stand', 'walk', 'fly'] as const) weights[p] = p === pose ? 1 : 0
      Object.assign(current, blend(phase, clock))
      apply(current, clock)
    },
    dispose() {
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
    },
  }
}
