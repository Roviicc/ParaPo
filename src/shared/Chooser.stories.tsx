import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Chooser } from './Chooser'
import type { VariantSummary } from './routes'
import type { StopRow } from './stops'

/** Sample data only, shaped like saved rows. Not read from Supabase. */
function route(id: string, name: string): VariantSummary['route'] {
  return {
    id,
    signboard: null,
    long_name: null,
    mode: 'jeepney',
    fare_note: null,
    head_stop_id: id + '-head',
    tail_stop_id: id + '-tail',
    via: null,
    name,
  }
}

/** One direction of a route; `drawn` false leaves it a slot, with no line yet. */
function variant(routeKey: string, name: string, direction: string, reversed = false, drawn = true): VariantSummary {
  return {
    id: routeKey + (reversed ? '-back' : '-out'),
    route_id: routeKey + '-route',
    direction_name: direction,
    origin_terminal: null,
    destination_terminal: null,
    shape: drawn ? { type: 'LineString', coordinates: [[121.04, 14.74], [121.05, 14.75]] } : null,
    reversed,
    confidence: 'drawn',
    route: route(routeKey + '-route', name),
  }
}

/**
 * Every direction of every route under the tap, slots included, the way the
 * hooks hand them over: the sheet groups them into one row per route.
 */
const routes: VariantSummary[] = [
  variant('a', 'Tala – SM Fairview', 'Tala → SM Fairview'),
  variant('a', 'Tala – SM Fairview', 'SM Fairview → Tala', true),
  variant('b', 'Novaliches – Quiapo', 'Novaliches → Quiapo'),
  variant('b', 'Novaliches – Quiapo', 'Quiapo → Novaliches', true, false),
  variant('c', 'Lagro – Fairview', 'Lagro → Fairview'),
  variant('c', 'Lagro – Fairview', 'Fairview → Lagro', true),
]

function stop(id: string, name: string, kind: StopRow['kind']): StopRow {
  return {
    id,
    owner_id: 'sample-owner',
    name,
    informal: null,
    aliases: [],
    kind,
    point: { type: 'Point', coordinates: [121.0467, 14.7478] },
    area: null,
    note: null,
    created_at: '2026-09-12T00:00:00Z',
  }
}

const stops: StopRow[] = [
  { ...stop('s1', 'Tala Jeepney Terminal', 'terminal'), informal: 'Tala' },
  stop('s2', 'Malaria', 'hintuan'),
]

const meta = {
  title: 'Shared/Chooser',
  component: Chooser,
  // The chooser is placed against the map, so give it a map-sized box to sit
  // in. `@container` is what its `@wide:` classes measure, and the `phone`
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
  args: { onRoute: fn(), onStop: fn(), onClose: fn() },
} satisfies Meta<typeof Chooser>

export default meta
type Story = StoryObj<typeof meta>

/** The common case: one tap landed on two routes sharing a road — four directions, two rows, one with its return still a slot. */
export const TwoRoutes: Story = { args: { routes: routes.slice(0, 4) } }

/** A box with a line through it: the hotspot first, then the route. */
export const HotspotAndRoute: Story = { args: { routes: routes.slice(0, 2), stops: stops.slice(1) } }

/** Three is still a list, not a menu. */
export const ThreeRoutes: Story = { args: { routes } }

/** Overlapping hotspots get the same treatment. */
export const TwoHotspots: Story = { args: { stops } }

/** On a handset the chooser opens pulled up: hiding the choice would defeat it. */
export const Phone: Story = {
  parameters: { phone: true },
  args: { routes },
}
