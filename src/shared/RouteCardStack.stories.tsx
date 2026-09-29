import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { RouteCardStack } from './RouteCardStack'
import type { TransportMode, VariantSummary } from './routes'

/**
 * Sample data only, shaped like the published file: the owner's two routes
 * out of Tala, each line `km` long straight north, so the fares are real
 * fares. Not the real map.
 */
function direction(route: string, name: string, dir: string, km: number, reversed = false, mode: TransportMode = 'jeepney'): VariantSummary {
  return {
    id: route + (reversed ? '-back' : '-out'),
    route_id: route,
    direction_name: dir,
    origin_terminal: null,
    destination_terminal: null,
    shape: { type: 'LineString', coordinates: [[121.04, 14.7], [121.04, 14.7 + km / 111.2]] },
    reversed,
    confidence: 'drawn',
    route: { id: route, signboard: null, long_name: null, mode, fare_note: null, head_stop_id: 'tala', tail_stop_id: route + '-tail', via: null, name },
  }
}
const tala: VariantSummary[] = [
  direction('nova', 'Tala – Novaliches', 'Tala → Novaliches', 12.4),
  direction('nova', 'Tala – Novaliches', 'Novaliches → Tala', 13.1, true),
  direction('sm', 'Tala – SM Fairview', 'Tala → SM Fairview', 9.4),
  direction('sm', 'Tala – SM Fairview', 'SM Fairview → Tala', 11.2, true),
]

type Frame = 'list' | 'hotspot'
/** The floating list's 368, and a hotspot card's 320 (Sheet's `@wide:w-80`). */
const FRAME = { list: 'w-92', hotspot: 'w-80' } satisfies Record<Frame, string>
const frameOf = (p: { frame?: Frame }) => FRAME[p.frame ?? 'list']

const meta = {
  title: 'Shared/RouteCardStack',
  component: RouteCardStack,
  decorators: [
    (Story, ctx) => (
      <div className={frameOf(ctx.parameters)}>
        <Story />
      </div>
    ),
  ],
  args: { routes: tala, back: false, onRoute: fn(), testId: 'card' },
} satisfies Meta<typeof RouteCardStack>

export default meta
type Story = StoryObj<typeof meta>

/** The way there: one place, Tala, with its two ways out — one card. The colours are drawn at random. */
export const OnePlace: Story = {}

/** The way back: a card per place, Novaliches and SM Fairview, never alike side by side. */
export const TwoPlaces: Story = { args: { back: true } }

/** As narrow as a hotspot's card on a wide screen, 320: the cards fill it edge to edge. */
export const InAHotspotCard: Story = { parameters: { frame: 'hotspot' } }

/** A mode with no fare rule beside a jeepney out of one place: no pesos on that card, nothing guessed. */
export const Unpriced: Story = {
  args: {
    routes: [...tala.slice(0, 2), direction('uv', 'Tala – Cubao', 'Tala → Cubao', 18, false, 'uv_express'), direction('uv', 'Tala – Cubao', 'Cubao → Tala', 18, true, 'uv_express')],
  },
}
