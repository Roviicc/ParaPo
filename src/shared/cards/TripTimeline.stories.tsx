import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, userEvent, within } from 'storybook/test'
import { TripTimeline } from './TripTimeline'

/**
 * A trip's card on its own, as RouteTripDetail insets it: one story a state,
 * and the pick in each livery. Long names, the pick kept while folded, and
 * the taps are RouteTripDetail's stories. Sample data only: the places of
 * the owner's frames (3762:3546), not the real map.
 */
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

/** Opens the fold, as a rider's tap would — and lets go of it, since a tap draws no focus ring. */
const openFold: Story['play'] = async ({ canvasElement }) => {
  const fold = within(canvasElement).getByRole('button', { name: /more hintuans/ })
  await userEvent.click(fold)
  fold.blur()
}

const meta = {
  title: 'Shared/TripTimeline',
  component: TripTimeline,
  decorators: [
    (Story) => (
      <div className="w-[393px] bg-surface px-3 py-3">
        <Story />
      </div>
    ),
  ],
  args: {
    livery: 'yellow',
    routeOrigin: 'Tala',
    hintuans: talaToNovaliches,
    routeDirection: 'Novaliches',
    picked: null,
    onPick: fn(),
    pickedFare: '₱18–20',
    onEnd: fn(),
    endPicked: null,
  },
} satisfies Meta<typeof TripTimeline>

export default meta
type Story = StoryObj<typeof meta>

/** Ten hintuans folded into one row. */
export const Folded: Story = {}

/** Opened: every hintuan alike, then View less. */
export const Opened: Story = { play: openFold }

/** One hintuan on the way: shown as it is, not folded. */
export const OneHintuan: Story = { args: { routeOrigin: 'Fatima', hintuans: hintuans('Lagro'), routeDirection: 'SM Fairview' } }

/** None on the way yet: the rail runs straight from the origin to the end. */
export const NoHintuan: Story = { args: { routeOrigin: 'Lagro', hintuans: [], routeDirection: 'SM Fairview' } }

/** Red, the Timeline set's own colour. */
export const Red: Story = { args: { livery: 'red' } }

/** Orange. */
export const Orange: Story = { args: { livery: 'orange' } }

/** Mist. */
export const Mist: Story = { args: { livery: 'mist' } }

/** A hintuan picked: its dot a white ring round the rail's colour, its name Black, its pill with the pesos to there. Opened, since the fold keeps it. */
export const HintuanPicked: Story = { args: { picked: 'h3' }, play: openFold }

/** Picked, red: the pill in the card's own colours, swapped. */
export const HintuanPickedRed: Story = { args: { livery: 'red', picked: 'h3' }, play: openFold }

/** Picked, orange. */
export const HintuanPickedOrange: Story = { args: { livery: 'orange', picked: 'h3' }, play: openFold }

/** Picked, mist: the pill near-black. */
export const HintuanPickedMist: Story = { args: { livery: 'mist', picked: 'h3' }, play: openFold }

/** One hintuan on the way, picked: not folded, so no fold to open. */
export const OneHintuanPicked: Story = {
  args: { routeOrigin: 'Fatima', hintuans: hintuans('Lagro'), routeDirection: 'SM Fairview', picked: 'h0', pickedFare: '₱14' },
}

/** A hintuan picked but unpriced: no pill. */
export const HintuanPickedUnpriced: Story = { args: { picked: 'h3', pickedFare: undefined }, play: openFold }

/** The origin picked from its row: its dot the Selected one. */
export const OriginPicked: Story = { args: { endPicked: 'from' } }

/** The destination picked from its row: its dot the Selected one. */
export const DestinationPicked: Story = { args: { endPicked: 'to' } }
