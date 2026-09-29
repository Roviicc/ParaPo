import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, userEvent, within } from 'storybook/test'
import { RouteTripDetail } from './RouteTripDetail'

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
  const fold = within(canvasElement).getByRole('button', { name: /more hintuan/ })
  await userEvent.click(fold)
  fold.blur()
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
  // A map-sized box, marked @container as the apps' roots are: the trip
  // docks along its bottom where the list did, and floats top-left from 1024
  // wide (`@float:`). Never taller than the canvas, so the story itself does
  // not scroll.
  decorators: [
    (Story, ctx) => (
      <div className={'relative h-dvh overflow-hidden bg-neutral-200 @container ' + frameOf(ctx.parameters)}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    livery: 'yellow',
    fare: '₱24–28',
    routeOrigin: 'Tala',
    hintuans: talaToNovaliches,
    routeDirection: 'Novaliches',
    switchable: true,
    back: false,
    onSwitch: fn(),
    onBackToList: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof RouteTripDetail>

export default meta
type Story = StoryObj<typeof meta>

/** On a phone, the owner's frame: Tala → Novaliches, its ten hintuans folded. */
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
  args: { routeOrigin: 'Fatima', hintuans: hintuans('Lagro'), routeDirection: 'SM Fairview', fare: '₱14' },
}

/** None on the way yet: the rail runs straight from the origin to the end. */
export const NoHintuan: Story = {
  args: { routeOrigin: 'Lagro', hintuans: [], routeDirection: 'SM Fairview', fare: '₱14' },
}

/** In red, the Timeline set's own colour, with Content/inverse words. */
export const Red: Story = { args: { livery: 'red' } }

/** Orange (Figma's Pink). */
export const Orange: Story = { args: { livery: 'orange' } }

/** Mist, with Content/primary words, like yellow. */
export const Mist: Story = { args: { livery: 'mist' } }

/** SWITCHed: the way back. SWITCH is pressed for a screen reader only; it has no drawn "on" look yet. */
export const TheWayBack: Story = {
  args: { routeOrigin: 'Novaliches', hintuans: [...talaToNovaliches].reverse(), routeDirection: 'Tala', back: true },
}

/** Opened by a tap on its one route, or a shared link: no list behind it, so no ‹. */
export const NothingToGoBackTo: Story = { render: (args) => <RouteTripDetail {...args} onBackToList={null} /> }

/** The route's other way is not drawn yet: SWITCH rests disabled. */
export const NothingTheOtherWay: Story = { args: { switchable: false } }

/** A mode with no fare rule: no pesos over the origin. */
export const Unpriced: Story = { args: { fare: undefined } }

/** Thirty hintuans, opened: taller than the room, the rail scrolls under the header. */
export const ALongWay: Story = { args: { hintuans: aLongWay }, play: openFold }

/** Place names too long for one line wrap; they are never cut. How a wrapped row sits on the rail is not drawn yet. */
export const LongNames: Story = {
  args: {
    livery: 'orange',
    routeOrigin: 'Novaliches (Bayan) via Zabarte',
    hintuans: hintuans('Lagro', 'Quirino Highway corner Zabarte Road, Robinsons Novaliches', 'Bistek'),
    routeDirection: 'Fairview Teraccess Transport Terminal',
  },
  play: openFold,
}

/** From 1024 wide, floating top-left where the list floats. */
export const Floating: Story = { parameters: { frame: 'wide' } }

/** Floating and opened: the owner's Tala → Novaliches is taller than 640, so the rail scrolls. */
export const FloatingOpened: Story = { parameters: { frame: 'wide' }, play: openFold }

/** The owner's 640 frame: still docked, as wide as the screen. */
export const Tablet: Story = { parameters: { frame: 'tablet' } }
