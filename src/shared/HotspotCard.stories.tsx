import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { HotspotCard } from './HotspotCard'
import type { VariantSummary } from './routes'
import type { StopRow } from './stops'

/** Sample data only, shaped like saved rows. Not read from Supabase. */
const route = {
  id: 'sample-route',
  signboard: 'Tala – SM Fairview',
  long_name: null,
  mode: 'jeepney',
  fare_note: null,
} as const

const outbound: VariantSummary = {
  id: 'sample-out',
  route_id: route.id,
  direction_name: 'Tala → SM Fairview',
  origin_terminal: null,
  destination_terminal: null,
  shape: null,
  confidence: 'drawn',
  route,
}

const inbound: VariantSummary = { ...outbound, id: 'sample-in', direction_name: 'SM Fairview → Tala' }

const terminal: StopRow = {
  id: 'sample-stop',
  owner_id: 'sample-owner',
  name: 'Tala Novaliches Jeep Terminal',
  kind: 'terminal',
  point: { type: 'Point', coordinates: [121.0467, 14.7478] },
  area: null,
  note: null,
  created_at: '2026-09-12T00:00:00Z',
}

const meta = {
  title: 'Shared/HotspotCard',
  component: HotspotCard,
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
  args: {
    stop: terminal,
    linkedVariantIds: [outbound.id, inbound.id],
    variants: [outbound, inbound],
    onSelectVariant: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof HotspotCard>

export default meta
type Story = StoryObj<typeof meta>

/** A terminal with both directions of one route grouped under its signboard. */
export const Terminal: Story = {}

/** A hintuan with a note and nothing linked yet. */
export const EmptyHintuan: Story = {
  args: {
    stop: {
      ...terminal,
      name: 'Malaria',
      kind: 'hintuan',
      note: 'Wait under the waiting shed across from the chapel.',
    },
    linkedVariantIds: [],
  },
}

/** A handset-sized box, so the card becomes a bottom sheet. */
export const Phone: Story = {
  parameters: { phone: true },
  args: {
    stop: { ...terminal, note: 'Jeeps queue along the kanto by the covered court.' },
  },
}
