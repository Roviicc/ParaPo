import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { RouteCard } from './RouteCard'

const meta = {
  title: 'Shared/RouteCard',
  component: RouteCard,
  // As wide as the floating list: the card fills whatever holds it.
  decorators: [(Story) => <div className="w-92"><Story /></div>],
  args: {
    livery: 'red',
    fare: '₱24–28',
    routeOrigin: 'Novaliches (Bayan)',
    endPoints: [{ id: 'a', routeDirection: 'Tala' }],
    onPick: fn(),
  },
} satisfies Meta<typeof RouteCard>

export default meta
type Story = StoryObj<typeof meta>

/** Red: Content/inverse under Route/RouteCardPrimary, the Primary Blob. */
export const Red: Story = {}

/** Orange — Figma's Pink, the Card/orange tokens. */
export const Orange: Story = { args: { livery: 'orange', routeOrigin: 'SM Fairview' } }

/** Mist: Content/primary under Route/RouteCardInverse, the Inverse Blob. */
export const Mist: Story = { args: { livery: 'mist', routeOrigin: 'SM Fairview' } }

/** Yellow: as Mist. */
export const Yellow: Story = { args: { livery: 'yellow', routeOrigin: 'Lagro' } }

/** One place, several ways out: a row each, and each row its own target. */
export const SeveralWaysOut: Story = {
  args: {
    routeOrigin: 'Tala',
    fare: '₱14–28',
    endPoints: [
      { id: 'a', routeDirection: 'SM Fairview' },
      { id: 'b', routeDirection: 'Novaliches (Bayan)' },
    ],
  },
}

/** The set's longest: six ways out — tall enough to show the glow fades out whole. */
export const SixWaysOut: Story = {
  args: {
    livery: 'orange',
    routeOrigin: 'SM Fairview',
    endPoints: ['Tala', 'Novaliches (Bayan)', 'Quiapo', 'Cubao', 'Lagro', 'Fatima'].map((p, i) => ({
      id: String(i),
      routeDirection: p,
    })),
  },
}

/** No fare rule for the mode (not a jeepney): no fare line, nothing guessed. */
export const Unpriced: Story = { args: { livery: 'yellow', fare: undefined, routeOrigin: 'Quiapo' } }

/** A place name too long for one line wraps; it is never cut. */
export const LongName: Story = {
  args: { livery: 'orange', routeOrigin: 'Fairview Teraccess Transport Terminal', endPoints: [{ id: 'a', routeDirection: 'Novaliches (Bayan) via Zabarte' }] },
}
