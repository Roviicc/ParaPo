import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { RouteCard } from './RouteCard'
import type { VariantSummary } from './routes'

/** Sample data only, shaped like a saved direction. Not read from Supabase. */
const variant: VariantSummary = {
  id: 'sample-variant',
  route_id: 'sample-route',
  direction_name: 'Tala → SM Fairview',
  origin_terminal: null,
  destination_terminal: null,
  shape: {
    type: 'LineString',
    coordinates: [
      [121.0467, 14.7478],
      [121.0512, 14.7391],
      [121.0578, 14.7302],
      [121.0601, 14.7221],
    ],
  },
  confidence: 'drawn',
  route: {
    id: 'sample-route',
    signboard: 'Tala – SM Fairview',
    long_name: null,
    mode: 'jeepney',
    fare_note: null,
  },
}

const meta = {
  title: 'Shared/RouteCard',
  component: RouteCard,
  // The card is placed against the map, so give it a map-sized box to sit in.
  decorators: [
    (Story) => (
      <div className="relative h-[28rem] bg-neutral-200">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: { variant, onClose: fn() },
} satisfies Meta<typeof RouteCard>

export default meta
type Story = StoryObj<typeof meta>

/** What a visitor sees for a route drawn but not yet ridden. */
export const Drawn: Story = {}

/** Every optional row filled in, and ridden. */
export const Verified: Story = {
  args: {
    variant: {
      ...variant,
      origin_terminal: 'Tala Novaliches Jeep Terminal',
      destination_terminal: 'SM Fairview',
      confidence: 'verified',
      route: {
        ...variant.route,
        long_name: 'Tala Novaliches – SM City Fairview via Camarin Road',
        fare_note: '₱13 minimum, as of Sept 2026',
      },
    },
  },
}

/** Long names truncate rather than push the close button off the card. */
export const LongNames: Story = {
  args: {
    variant: {
      ...variant,
      route: {
        ...variant.route,
        signboard: 'Tala – Bagong Silang Phase 1 – Malaria – SM Fairview – Novaliches Bayan',
        long_name: 'A very long descriptive name that will not fit on one line of the card',
      },
    },
  },
}

/** The editor passes buttons along the bottom; the public map passes none. */
export const WithActions: Story = {
  args: {
    actions: (
      <>
        <button type="button" className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white">
          Edit
        </button>
        <button type="button" className="rounded-lg px-3 py-1.5 text-sm text-red-600 ring-1 ring-red-200">
          Delete
        </button>
      </>
    ),
  },
}
