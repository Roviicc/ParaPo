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
  reversed: false,
  confidence: 'drawn',
  route: {
    id: 'sample-route',
    signboard: 'FAIRVIEW – TALA',
    long_name: null,
    mode: 'jeepney',
    fare_note: null,
    head_stop_id: 'sample-tala',
    tail_stop_id: 'sample-fairview',
    via: null,
    name: 'Tala – SM Fairview',
  },
}

const meta = {
  title: 'Shared/RouteCard',
  component: RouteCard,
  // The card is placed against the map, so give it a map-sized box to sit in.
  // `@container` is what the card's `@wide:` classes measure, and the `phone`
  // parameter shrinks that box to a handset so the bottom sheet shows instead.
  decorators: [
    (Story, ctx) => (
      <div
        className={
          ctx.parameters.phone
            ? 'relative h-[700px] w-[390px] overflow-hidden bg-neutral-200 @container'
            : 'relative h-[28rem] bg-neutral-200 @container'
        }
      >
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
        name: 'Tala Jeepney Terminal – SM City Fairview Main Entrance via Quirino Highway',
        signboard: 'TALA – BAGONG SILANG PH1 – MALARIA – SM FAIRVIEW – NOVALICHES BAYAN',
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

/**
 * A handset-sized box, so the card becomes a bottom sheet. The peek shows the
 * signboard and the direction; the handle pulls the rest up.
 */
export const Phone: Story = {
  parameters: { phone: true },
  args: {
    variant: {
      ...variant,
      origin_terminal: 'Tala Novaliches Jeep Terminal',
      destination_terminal: 'SM Fairview',
      route: { ...variant.route, fare_note: '₱13 minimum, as of Sept 2026' },
    },
  },
}

/** The same route, ridden the other way, for the switch beside the title. */
const back: VariantSummary = {
  ...variant,
  id: 'sample-variant-back',
  direction_name: 'SM Fairview → Tala',
  reversed: true,
  shape: { type: 'LineString', coordinates: [...variant.shape!.coordinates].reverse() },
}

/** The switch beside the title shows the other direction. */
export const WithTheOtherDirection: Story = {
  args: { sibling: back, onSwitch: fn() },
}

/** The other direction exists as a slot but has no line yet: the switch is off, and the card says so. */
export const OtherDirectionNotMapped: Story = {
  args: { sibling: { ...back, shape: null }, onSwitch: fn() },
}
