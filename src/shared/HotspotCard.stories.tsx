import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, userEvent, within } from 'storybook/test'
import { HotspotCard } from './HotspotCard'
import type { VariantSummary } from './routes'
import type { StopRow } from './stops'

/** Sample data only, shaped like saved rows. Not read from Supabase. */
const route = {
  id: 'sample-route',
  signboard: null,
  long_name: null,
  mode: 'jeepney',
  fare_note: null,
  head_stop_id: 'sample-stop',
  tail_stop_id: 'sample-fairview',
  via: null,
  name: 'Tala – SM Fairview',
} as const

const outbound: VariantSummary = {
  id: 'sample-out',
  route_id: route.id,
  direction_name: 'Tala → SM Fairview',
  origin_terminal: null,
  destination_terminal: null,
  shape: null,
  reversed: false,
  confidence: 'drawn',
  route,
}

const inbound: VariantSummary = { ...outbound, id: 'sample-in', direction_name: 'SM Fairview → Tala', reversed: true }

const terminal: StopRow = {
  id: 'sample-stop',
  owner_id: 'sample-owner',
  name: 'Tala Jeepney Terminal',
  informal: 'Tala',
  aliases: ['Tala Terminal', 'Terminal Tala'],
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

/** A terminal with the route through it, in the studio's rows: by the place it leaves from, ⇄ for the way back. The stop name leads; the ground name is the small line under it. */
export const Terminal: Story = {}

/** A hintuan with a note and nothing linked yet. */
export const EmptyHintuan: Story = {
  args: {
    stop: {
      ...terminal,
      name: 'Malaria',
      informal: null,
      aliases: [],
      kind: 'hintuan',
      note: 'Wait under the waiting shed across from the chapel.',
    },
    linkedVariantIds: [],
  },
}

/**
 * One box of a place with company: the card says what SM Fairview is made
 * of and lists the other boxes, terminal first, each a tap away.
 */
const fairview = (id: string, name: string, kind: StopRow['kind']): StopRow => ({
  ...terminal,
  id,
  name,
  informal: 'SM Fairview',
  aliases: [],
  kind,
  point: { type: 'Point', coordinates: [121.0424 + Math.random() * 0.001, 14.7415] },
})
const fairviewBoxes = [
  fairview('fv-terminal', 'SM City Fairview Jeepney Terminal', 'terminal'),
  fairview('fv-babaan', 'SM Fairview Main Babaan', 'hintuan'),
  fairview('fv-teraccess', 'Fairview Teraccess', 'hintuan'),
]
export const PartOfAPlace: Story = {
  args: {
    stop: fairviewBoxes[1]!,
    stops: fairviewBoxes,
    onPickSibling: fn(),
    linkedVariantIds: [inbound.id],
  },
}

/** A handset-sized box, so the card becomes a bottom sheet. */
export const Phone: Story = {
  parameters: { phone: true },
  args: {
    stop: { ...terminal, note: 'Jeeps queue along the kanto by the covered court.' },
  },
}

/**
 * Drawn directions, each line `km` long (so the fare is a real fare): the
 * owner's two routes out of Tala, both through SM Fairview. Sample data.
 */
const drawn = (key: string, name: string, direction: string, km: number, reversed = false): VariantSummary => ({
  ...outbound,
  id: key + (reversed ? '-back' : '-out'),
  route_id: key,
  direction_name: direction,
  shape: { type: 'LineString', coordinates: [[121.04, 14.7], [121.04, 14.7 + km / 111.2]] },
  reversed,
  route: { ...route, id: key, name, head_stop_id: 'sample-stop', tail_stop_id: key + '-tail' },
})
const talaRoutes = [
  drawn('nova', 'Tala – Novaliches', 'Tala → Novaliches', 12.4),
  drawn('nova', 'Tala – Novaliches', 'Novaliches → Tala', 13.1, true),
  drawn('sm', 'Tala – SM Fairview', 'Tala → SM Fairview', 9.4),
  drawn('sm', 'Tala – SM Fairview', 'SM Fairview → Tala', 11.2, true),
]

/**
 * The public map's card (`routeCards`, the owner's ask of 2026-09-29): the
 * routes through here as his RouteCards, edge to edge — his SM Fairview
 * screenshot, Tala with its two ways out, in a colour drawn at random. The
 * rest of the card waits for his hintuan design.
 */
export const RouteCards: Story = {
  args: {
    routeCards: true,
    stop: fairviewBoxes[2]!,
    stops: fairviewBoxes,
    onPickSibling: fn(),
    linkedVariantIds: talaRoutes.map((v) => v.id),
    variants: talaRoutes,
  },
}

/** ⇄ pressed: the way back, a card per place — Novaliches, SM Fairview — never alike side by side. */
export const RouteCardsTheWayBack: Story = {
  args: RouteCards.args,
  play: async ({ canvasElement }) => {
    const flip = within(canvasElement).getByTestId('card-flip')
    await userEvent.click(flip)
    flip.blur()
  },
}

/**
 * On a phone, pulled up: the cards scroll in the sheet under the hotspot's
 * name. Pulled up by the keyboard, whose Enter sends a click alone — the
 * handle's plain toggle — so the story does not hang on how a synthetic
 * pointer tap's events line up with the click the sheet swallows after one.
 */
export const RouteCardsPhone: Story = {
  args: RouteCards.args,
  parameters: { phone: true },
  play: async ({ canvasElement }) => {
    const handle = within(canvasElement).getByTestId('sheet-handle')
    handle.focus()
    await userEvent.keyboard('{Enter}')
    handle.blur()
  },
}

/**
 * The ways back not drawn yet: the RouteCards list drawn ways only, so the
 * way there is shown, and ⇄ is gone — there is nothing to turn round to. The
 * studio's rows would offer ⇄ and "Not mapped yet".
 */
export const RouteCardsNothingTheOtherWay: Story = {
  args: {
    ...RouteCards.args,
    variants: talaRoutes.map((v) => (v.reversed ? { ...v, shape: null } : v)),
  },
}

/** A terminal's card, "Routes that stage here": the same RouteCards (the owner, 2026-09-29). */
export const RouteCardsTerminal: Story = {
  args: {
    routeCards: true,
    linkedVariantIds: talaRoutes.map((v) => v.id),
    variants: talaRoutes,
  },
}

/** Only slots are linked here yet: the RouteCards list drawn ways only, so there is nothing to list. */
export const RouteCardsNothingDrawn: Story = { args: { routeCards: true } }
