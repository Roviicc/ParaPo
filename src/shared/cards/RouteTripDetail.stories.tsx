import type { ComponentProps } from 'react'
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { RouteTripDetail } from './RouteTripDetail'
import { kmLabel } from '../geo/geo'

/** Sample data only: the places of the owner's frames (3762:3546), not the real map. */
const hintuans = (...labels: string[]) => labels.map((label, i) => ({ id: 'h' + i, label }))
const talaToNovaliches = hintuans(
  'Barracks',
  'Malaria',
  'Pangarap',
  'Amparo',
  'Fatima',
  'Lagro',
  'SM Fairview',
  'Bistek',
  'Greenfields',
  'Bestlink',
)
const talaToFairview = talaToNovaliches.slice(0, 6)
const aLongWay = hintuans(...Array.from({ length: 30 }, (_, i) => `Hintuan ${i + 1}`))

/** Opens the fold, as a rider's tap would — and lets go of it, since a tap draws no focus ring. */
const openFold: Story['play'] = async ({ canvasElement }) => {
  const fold = within(canvasElement).getByRole('button', { name: /more hintuans/ })
  await userEvent.click(fold)
  fold.blur()
}

/**
 * Keeps the picks as the public map does (useRideTo): a row picks its
 * hintuan, or an end, and again lets it go; one at a time.
 */
function Picking(props: ComponentProps<typeof RouteTripDetail>) {
  const [picked, setPicked] = useState(props.picked)
  const [atEnd, setAtEnd] = useState(props.endPicked)
  return (
    <RouteTripDetail
      {...props}
      picked={picked}
      endPicked={atEnd}
      onPick={(id) => {
        props.onPick(id)
        setAtEnd(null)
        setPicked((cur) => (cur === id ? null : id))
      }}
      onEnd={(end) => {
        props.onEnd(end)
        setPicked(null)
        setAtEnd((cur) => (cur === end ? null : end))
      }}
    />
  )
}

type Frame = 'phone' | 'tablet' | 'wide'
const FRAME = {
  phone: 'max-h-[852px] w-[393px]',
  tablet: 'max-h-[960px] w-[640px]',
  wide: 'max-h-[640px] w-[1024px]',
} satisfies Record<Frame, string>
const frameOf = (p: { frame?: Frame }) => FRAME[p.frame ?? 'phone']

const meta = {
  title: 'Shared/RouteTripDetail',
  component: RouteTripDetail,
  // Keyed on the picks, so the controls panel's `picked` starts it afresh.
  render: (args) => <Picking key={`${args.picked}:${args.endPicked}`} {...args} />,
  // A map-sized box, marked @container as the apps' roots are: the trip
  // docks along its bottom where the list did, and sits in the top-left
  // corner from 1024 wide (`@float:`). Never taller than the canvas, so the
  // story itself does not scroll.
  decorators: [
    (Story, ctx) => (
      <div className={'relative h-dvh overflow-clip bg-neutral-200 @container ' + frameOf(ctx.parameters)}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    livery: 'yellow',
    // 12.8 km, as the owner's frame has it; its pesos on today's rule.
    metres: 12_800,
    fare: { regular: '₱30–32', discounted: '₱24–26' },
    routeOrigin: 'Tala',
    hintuans: talaToNovaliches,
    routeDirection: 'Novaliches',
    switchable: true,
    back: false,
    onSwitch: fn(),
    onBackToList: fn(),
    onClose: fn(),
    picked: null,
    onPick: fn(),
    onEnd: fn(),
    endPicked: null,
    // Amparo's, fourth on the way: from Tala to there on today's map.
    pickedMetres: 7_300,
    pickedFare: { regular: '₱20–22', discounted: '₱16–18' },
  },
} satisfies Meta<typeof RouteTripDetail>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Opened to the picked row, which checks it as Figma's State=Selected draws
 * it: the one row, its pill of pesos in the card's own colours swapped, and
 * the fare tile pricing the ride to there, the same pesos.
 */
const pickedAsDrawn: Story['play'] = async (ctx) => {
  await openFold(ctx)
  const { canvasElement, args } = ctx
  const rows = canvasElement.querySelectorAll<HTMLElement>('[data-testid="trip-hintuan"][data-state="selected"]')
  await expect(rows.length).toBe(1)
  const pill = rows[0].querySelector<HTMLElement>('[data-testid="trip-hintuan-fare"]')
  await expect(pill?.textContent).toBe(args.pickedFare?.regular)
  await expect(within(canvasElement).getByTestId('trip-fare').textContent).toBe(args.pickedFare?.regular)
  // The Kilometer tile follows the pick too.
  await expect(within(canvasElement).getByTestId('trip-km').textContent).toBe(kmLabel(args.pickedMetres ?? args.metres))
  const card = within(canvasElement).getByTestId('trip')
  if (pill) {
    // Its words' colour behind the pesos, its fill for them.
    await expect(getComputedStyle(pill).backgroundColor).toBe(getComputedStyle(card).color)
    await expect(getComputedStyle(pill).color).toBe(getComputedStyle(card).backgroundColor)
  }
}

/** On a phone, the owner's frame (3778:3183, Variant2): Tala → Novaliches, its Kilometer and Expected fare, its ten hintuans folded. */
export const Folded: Story = {}

/** Opened: every hintuan alike — SM Fairview among them — then View less. */
export const Opened: Story = { play: openFold }

/** The owner's other frame: Tala → SM Fairview, six hintuans, opened. */
export const ToSMFairview: Story = {
  args: { hintuans: talaToFairview, routeDirection: 'SM Fairview' },
  play: openFold,
}

/** One hintuan on the way: shown as it is, not folded behind a row of its own size. */
export const OneHintuan: Story = {
  args: { routeOrigin: 'Fatima', hintuans: hintuans('Lagro'), routeDirection: 'SM Fairview', metres: 3_100, fare: { regular: '₱14', discounted: '₱11–12' } },
}

/** None on the way yet: the rail runs straight from the origin to the end. */
export const NoHintuan: Story = {
  args: { routeOrigin: 'Lagro', hintuans: [], routeDirection: 'SM Fairview', metres: 2_400, fare: { regular: '₱14', discounted: '₱11–12' } },
}

/** In red, the Timeline set's own colour, with Content/inverse words. */
export const Red: Story = { args: { livery: 'red' } }

/** Orange (Figma's Pink). */
export const Orange: Story = { args: { livery: 'orange' } }

/** Fuchsia, with Content/inverse words, like red. */
export const Fuchsia: Story = { args: { livery: 'fuchsia' } }

/** SWITCHed: the way back. SWITCH is pressed for a screen reader only; it has no drawn "on" look yet. */
export const TheWayBack: Story = {
  args: { routeOrigin: 'Novaliches', hintuans: [...talaToNovaliches].reverse(), routeDirection: 'Tala', back: true },
}

/** Opened with no list behind it — a tap on its line, a shared link, a hotspot's card — and no other route sharing an end drawn its way round: nothing to go back to, so no ‹. */
export const NothingToGoBackTo: Story = { render: (args) => <RouteTripDetail {...args} onBackToList={null} /> }

/** The route's other way is not drawn yet: SWITCH rests disabled. */
export const NothingTheOtherWay: Story = { args: { switchable: false } }

/** A mode with no fare rule: no Expected fare tile, and Kilometer takes the row (nothing drawn for it; the owner kept this, 2026-09-29). */
export const Unpriced: Story = { args: { fare: undefined } }

/**
 * The fare tile turns (3778:3183, redrawn 2026-09-30): a tap shows the
 * discounted fare, ↻ turning once; another, the regular again.
 */
export const FareTurns: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('trip-fare').textContent).toBe('₱30–32')
    await expect(canvas.getByTestId('trip-fare-turn').textContent).toContain('Regular fare')
    await userEvent.click(canvas.getByTestId('trip-fare-turn'))
    await expect(canvas.getByTestId('trip-fare').textContent).toBe('₱24–26')
    await expect(canvas.getByTestId('trip-fare-turn').textContent).toContain('Discounted fare')
    await userEvent.click(canvas.getByTestId('trip-fare-turn'))
    await expect(canvas.getByTestId('trip-fare').textContent).toBe('₱30–32')
  },
}

/** Thirty hintuans, opened: taller than the room, the rail scrolls under the header. */
export const ALongWay: Story = { args: { hintuans: aLongWay }, play: openFold }

/** Place names too long for one line wrap; they are never cut. How a wrapped row sits on the rail is not drawn yet. */
export const LongNames: Story = {
  args: {
    livery: 'orange',
    metres: 8_600,
    fare: { regular: '₱24–26', discounted: '₱19–21' },
    routeOrigin: 'Novaliches (Bayan) via Zabarte',
    hintuans: hintuans('Lagro', 'Quirino Highway corner Zabarte Road, Robinsons Novaliches', 'Bistek'),
    routeDirection: 'Fairview Teraccess Transport Terminal',
  },
  play: openFold,
}

/** From 1024 wide, in the top-left corner where the list sits. */
export const Floating: Story = { parameters: { frame: 'wide' } }

/** In the corner and opened: the owner's Tala → Novaliches is taller than 640, so the rail scrolls. */
export const FloatingOpened: Story = { parameters: { frame: 'wide' }, play: openFold }

/** The owner's 640 frame: still docked, as wide as the screen. */
export const Tablet: Story = { parameters: { frame: 'tablet' } }

/**
 * A hintuan picked, red — the Timeline set's Selected row on the owner's
 * card (3769:2895), recoloured 2026-09-30 (3778:3183): Amparo's dot a white
 * ring round the rail's red, no longer green, its name Black, and
 * a white pill with the pesos from Tala to there in the card's red. Opened,
 * since the fold keeps it.
 */
export const PickedRed: Story = { args: { livery: 'red', picked: 'h3' }, play: pickedAsDrawn }

/** Orange, as red: he drew no orange trip. */
export const PickedOrange: Story = { args: { livery: 'orange', picked: 'h3' }, play: pickedAsDrawn }

/** Fuchsia, as red: the pill white, its pesos in the card's fuchsia. */
export const PickedFuchsia: Story = { args: { livery: 'fuchsia', picked: 'h3' }, play: pickedAsDrawn }

/** Yellow (3785:4462): the pill near-black, Content/primary, its pesos in the card's yellow. */
export const PickedYellow: Story = { args: { picked: 'h3' }, play: pickedAsDrawn }

/** Tapped through: Amparo's row picks it, pill and all; the tile turned to Discounted, the pill with it; a second tap lets it go. */
export const PickAndLetGo: Story = {
  play: async (ctx) => {
    await openFold(ctx)
    const { canvasElement, args } = ctx
    const canvas = within(canvasElement)
    // The opened rows come into sight a frame or two after the tap.
    await userEvent.click(await canvas.findByRole('button', { name: /Amparo/, pressed: false }))
    await expect(args.onPick).toHaveBeenCalledWith('h3')
    await expect(canvas.getByTestId('trip-hintuan-fare').textContent).toBe('₱20–22')
    await expect(canvas.getByTestId('trip-fare').textContent).toBe('₱20–22')
    // Turned to Discounted, the pill follows the tile (the owner, 2026-09-30).
    await userEvent.click(canvas.getByTestId('trip-fare-turn'))
    await expect(canvas.getByTestId('trip-hintuan-fare').textContent).toBe('₱16–18')
    await expect(canvas.getByTestId('trip-fare').textContent).toBe('₱16–18')
    await userEvent.click(canvas.getByRole('button', { name: /Amparo/, pressed: true }))
    await expect(canvas.queryByTestId('trip-hintuan-fare')).toBeNull()
    await expect(canvasElement.querySelectorAll('[data-state="selected"]').length).toBe(0)
  },
}

/**
 * The ends are buttons too, and picked like a hintuan (the owner's asks,
 * 2026-09-29): Tala picks itself, its dot the Selected one, lets Amparo go and says
 * which end to show; a second tap lets it go. Novaliches the same. One at a
 * time: each lets the others go.
 */
export const EndsShowTheWhole: Story = {
  args: { picked: 'h3' },
  play: async (ctx) => {
    const { canvasElement, args } = ctx
    const canvas = within(canvasElement)
    const selected = () => canvasElement.querySelectorAll('[data-testid="trip-hintuan"][data-state="selected"]').length
    const origin = () => canvas.getByTestId('trip-origin').getAttribute('data-state')
    const destination = () => canvas.getByTestId('trip-destination').getAttribute('data-state')
    await expect(selected()).toBe(1)
    await userEvent.click(canvas.getByRole('button', { name: 'Tala', pressed: false }))
    await expect(args.onEnd).toHaveBeenLastCalledWith('from')
    await expect(selected()).toBe(0)
    await expect(origin()).toBe('selected')
    await expect(destination()).toBe('rest')
    await userEvent.click(canvas.getByRole('button', { name: 'Tala', pressed: true }))
    await expect(origin()).toBe('rest')
    await openFold(ctx)
    await userEvent.click(await canvas.findByRole('button', { name: /Amparo/, pressed: false }))
    await expect(selected()).toBe(1)
    await userEvent.click(canvas.getByRole('button', { name: 'Novaliches', pressed: false }))
    await expect(args.onEnd).toHaveBeenLastCalledWith('to')
    await expect(selected()).toBe(0)
    await expect(destination()).toBe('selected')
    await expect(canvas.queryByTestId('trip-hintuan-fare')).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Novaliches', pressed: true }))
    await expect(destination()).toBe('rest')
    // Picked again, then let go by the origin, picked in its place; and the
    // origin let go by a hintuan.
    await userEvent.click(canvas.getByRole('button', { name: 'Novaliches', pressed: false }))
    await expect(destination()).toBe('selected')
    await userEvent.click(canvas.getByRole('button', { name: 'Tala', pressed: false }))
    await expect(destination()).toBe('rest')
    await expect(origin()).toBe('selected')
    await userEvent.click(canvas.getByRole('button', { name: /Amparo/, pressed: false }))
    await expect(origin()).toBe('rest')
    await expect(selected()).toBe(1)
  },
}

/** Where the trip leaves from, picked: its dot a white ring round the rail's colour, as a picked hintuan's; its name and the tiles as they were. */
export const OriginPicked: Story = { args: { livery: 'red', endPicked: 'from' } }

/** Where the trip goes, picked, the same way. */
export const DestinationPicked: Story = { args: { livery: 'red', endPicked: 'to' } }

/** Both ends' picks on a light card: here, where it goes. */
export const DestinationPickedYellow: Story = { args: { endPicked: 'to' } }

/** Folded away and opened again, the pick is still there, pill and all (the default he kept). */
export const PickFoldedAway: Story = {
  play: async (ctx) => {
    await openFold(ctx)
    const { canvasElement } = ctx
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /Amparo/, pressed: false }))
    await userEvent.click(canvas.getByRole('button', { name: /View less/ }))
    await expect(canvasElement.querySelectorAll('[data-testid="trip-hintuan"][data-state="selected"]').length).toBe(1)
    await openFold(ctx)
    await expect(await canvas.findByRole('button', { name: /Amparo/, pressed: true })).toBeTruthy()
    await expect(canvas.getByTestId('trip-hintuan-fare').textContent).toBe('₱20–22')
    await expect(canvas.getByTestId('trip-fare').textContent).toBe('₱20–22')
  },
}

/** The lone hintuan picked: no fold to open. */
export const OneHintuanPicked: Story = {
  args: { ...OneHintuan.args, picked: 'h0', pickedMetres: 1_900, pickedFare: { regular: '₱14', discounted: '₱11–12' } },
}

/**
 * A mode with no fare rule: the row picked, and no pill, as there is no
 * Expected fare tile. A row whose box the line misses would look the same
 * beside the tile; the published map has none (timeline-test checks every
 * row cuts).
 */
export const PickedUnpriced: Story = { args: { fare: undefined, picked: 'h3', pickedMetres: undefined, pickedFare: undefined }, play: openFold }

/** In the corner, picked. */
export const FloatingPicked: Story = { args: { picked: 'h3' }, parameters: { frame: 'wide' }, play: openFold }

/** A name too long for one line, picked: it wraps beside the pill, which keeps its line. Sample pesos. */
export const LongNamesPicked: Story = { args: { ...LongNames.args, picked: 'h1', pickedMetres: 5_200, pickedFare: { regular: '₱16–18', discounted: '₱12–15' } }, play: openFold }

/**
 * The owner's BottomSheetConfiguration (3815:5637, 2026-09-30), on a phone:
 * the stories above open at Middle; a tap on the HandleNotch goes round.
 */
const tapHandle = async (canvasElement: HTMLElement, times: number) => {
  const handle = within(canvasElement).getByTestId('dock-handle')
  for (let i = 0; i < times; i++) await userEvent.click(handle)
  handle.blur()
}

/** Max: the whole map, the header at the top, the rest scrolling under it (3815:4306). */
export const SheetMax: Story = {
  args: { hintuans: aLongWay },
  play: async (ctx) => {
    await openFold(ctx)
    await tapHandle(ctx.canvasElement, 1)
    await expect(within(ctx.canvasElement).getByTestId('card')).toHaveAttribute('data-snap', 'max')
  },
}

/** Low: the header and the origin along the bottom, the map above it (3814:3976). */
export const SheetLow: Story = {
  play: async (ctx) => {
    await tapHandle(ctx.canvasElement, 2)
    await expect(within(ctx.canvasElement).getByTestId('card')).toHaveAttribute('data-snap', 'low')
  },
}

/** Low with a long origin: one line of it, cut short (3814:3976). */
export const SheetLowLongName: Story = {
  args: LongNames.args,
  play: async (ctx) => {
    await tapHandle(ctx.canvasElement, 2)
    const origin = within(ctx.canvasElement).getByText(LongNames.args!.routeOrigin!)
    await waitFor(() => expect(origin.getBoundingClientRect().height).toBe(32))
  },
}

/** Middle with a long origin: all of it, on as many lines as it takes. */
export const SheetMiddleLongName: Story = {
  args: LongNames.args,
  play: async (ctx) => {
    const origin = within(ctx.canvasElement).getByText(LongNames.args!.routeOrigin!)
    await expect(origin.getBoundingClientRect().height).toBeGreaterThan(32)
  },
}
