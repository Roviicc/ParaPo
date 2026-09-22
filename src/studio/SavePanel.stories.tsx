import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import type { LngLat, Segment } from '../shared/geo'
import type { RouteRow } from '../shared/routes'
import type { StopRow } from '../shared/stops'
import { SavePanel } from './SavePanel'
import type { Drawing } from './useDrawing'

/** Two terminals, one near each end of the sample line, so the pickers have something to guess. */
function terminal(id: string, name: string, at: LngLat): StopRow {
  const [x, y] = at
  const d = 0.0003
  return {
    id,
    owner_id: 'sample-owner',
    name,
    informal: null,
    aliases: [],
    kind: 'terminal',
    point: { type: 'Point', coordinates: at },
    area: { type: 'Polygon', coordinates: [[[x - d, y - d], [x + d, y - d], [x + d, y + d], [x - d, y + d], [x - d, y - d]]] },
    note: null,
    created_at: '2026-09-21T00:00:00Z',
  }
}

const stops: StopRow[] = [
  { ...terminal('sample-tala', 'Tala Jeepney Terminal', [121.043326, 14.742006]), informal: 'Tala' },
  { ...terminal('sample-fairview', 'SM Fairview Terminal A', [121.0424, 14.741507]), informal: 'SM Fairview' },
]

/**
 * Just the parts of a drawing the panel reads. Sample data only: a story has no
 * Supabase client, so pressing Save here shows an error and writes nothing.
 */
function drawing(segments: Segment[], uTurns = 0): Drawing {
  const controlPoints: LngLat[] = [
    [121.043326, 14.742006],
    [121.04184, 14.742003],
    [121.0424, 14.741507],
  ]
  return {
    controlPoints,
    segments,
    metres: 640,
    uTurns: Array.from({ length: uTurns }, (_, i) => ({ point: i + 1, stub: [], metres: 60 })),
  } as unknown as Drawing
}

const routed = (streets?: Segment['streets']): Segment => ({
  snap: 'snapped',
  coordinates: [
    [121.043326, 14.742006],
    [121.04184, 14.742003],
  ],
  streets,
})

const meta = {
  title: 'Studio/SavePanel',
  component: SavePanel,
  // The panel covers the map it sits over, so give it a map-sized box.
  decorators: [
    (Story) => (
      <div className="relative h-[44rem] bg-neutral-200">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    draw: drawing([
      routed([{ name: 'Sinai Street', metres: 160 }]),
      routed([
        { name: 'Sinai Street', metres: 60 },
        { name: 'Assyria Street', metres: 55 },
      ]),
    ]),
    existing: null,
    route: null,
    stops,
    onSaved: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof SavePanel>

export default meta
type Story = StoryObj<typeof meta>

/** A new route, every stretch routed since street names were recorded. */
export const WithStreetNames: Story = {}

/** One stretch drawn straight: the list says so rather than running across it. */
export const WithAStraightStretch: Story = {
  args: {
    draw: drawing([
      routed([{ name: 'Sinai Street', metres: 160 }]),
      { snap: 'freehand', coordinates: [[121.04184, 14.742003], [121.0424, 14.741507]] },
    ]),
  },
}

/** A route saved before names were recorded: no list, and a hint how to get one. */
export const RoutedBeforeNames: Story = {
  args: { draw: drawing([routed(), routed()]) },
}

/** The route turns back on itself at a point: warned before saving. */
export const WithAUTurn: Story = {
  args: {
    draw: drawing(
      [
        routed([{ name: 'Sinai Street', metres: 160 }]),
        routed([
          { name: 'Sinai Street', metres: 60 },
          { name: 'Assyria Street', metres: 55 },
        ]),
      ],
      1,
    ),
  },
}

/**
 * The owner's list on 2026-09-22: one terminal and four hintuans at SM
 * Fairview (one typed "SM fairview"), two boxes each named Lagro and Fatima,
 * and Tala. The pickers must show eight places, never a box name.
 */
const hintuan = (id: string, name: string, at: LngLat, informal: string | null = null): StopRow => ({
  ...terminal(id, name, at),
  kind: 'hintuan',
  informal,
})
export const ManyBoxesOnePlace: Story = {
  args: {
    stops: [
      ...stops,
      hintuan('h1', 'Fairview Teraccess', [121.0426, 14.7412], 'SM Fairview'),
      hintuan('h2', 'Fairview Teraccess', [121.0428, 14.7413], 'SM Fairview'),
      hintuan('h3', 'SM Fairview Main Babaan', [121.043, 14.7414], 'SM Fairview'),
      hintuan('h4', 'SM Fairview Public Transport Terminal', [121.0422, 14.7416], 'SM Fairview'),
      hintuan('h5', 'SM fairview', [121.0421, 14.7411]),
      hintuan('h6', 'Lagro', [121.06, 14.74]),
      hintuan('h7', 'Lagro', [121.061, 14.74]),
      hintuan('h8', 'Fatima', [121.05, 14.75]),
      hintuan('h9', 'Fatima', [121.051, 14.75]),
      hintuan('h10', 'Robinson', [121.0432, 14.7418]),
      hintuan('h11', 'Malaria', [121.07, 14.76], 'Malaria'),
    ],
  },
}

/** The route the return-trip stories add a direction to. */
const talaFairview: RouteRow = {
  id: 'sample-route',
  owner_id: 'sample-owner',
  signboard: null,
  route_code: null,
  short_name: null,
  long_name: null,
  mode: 'jeepney',
  fare_note: null,
  fare_as_of: null,
  head_stop_id: 'sample-tala',
  tail_stop_id: 'sample-fairview',
  via: null,
}

/** The sample line, drawn the other way: from SM Fairview back to Tala. */
function drawingBack(): Drawing {
  const d = drawing([routed([{ name: 'Assyria Street', metres: 55 }]), routed([{ name: 'Sinai Street', metres: 160 }])])
  return { ...d, controlPoints: [...d.controlPoints].reverse() } as Drawing
}

/**
 * Tala – SM Fairview exists with its outbound drawn; this is its return trip,
 * drawn from SM Fairview. The panel leads with the direction — "SM Fairview →
 * Tala" — because "to Tala" under a locked "Tala – SM Fairview" read as not
 * reversed at all (the owner, 2026-09-22).
 */
export const TheReturnTrip: Story = {
  args: { route: talaFairview, slotReversed: true, draw: drawingBack() },
}

/** The same slot, but the line was started from Tala again: warned, not blocked. */
export const ReturnTripDrawnFromTheWrongEnd: Story = {
  args: { route: talaFairview, slotReversed: true },
}

/**
 * Two hintuans drawn across the sample line, one far from it: the panel lists
 * the two, in the order the line reaches them, and not the third — the same
 * rule the save applies.
 */
export const PassesThroughHintuans: Story = {
  args: {
    stops: [
      ...stops,
      hintuan('h-on-1', 'Barracks', [121.0428, 14.742005]),
      hintuan('h-on-2', 'Malaria', [121.0421, 14.741995]),
      hintuan('h-off', 'Nowhere Near', [121.045, 14.745]),
    ],
  },
}

/** A small box, centred `metres` north of the sample line, with its near edge `metres` away. */
const roadside = (id: string, name: string, lng: number, metres: number, informal: string | null = null): StopRow => {
  const half = 0.00005 // ≈ 5.5 m
  const edge = 14.742005 + metres / 111_000
  const s = hintuan(id, name, [lng, edge + half * Math.sign(metres)], informal)
  s.area = {
    type: 'Polygon',
    coordinates: [[[lng - 0.0001, edge], [lng + 0.0001, edge], [lng + 0.0001, edge + 2 * half * Math.sign(metres)], [lng - 0.0001, edge + 2 * half * Math.sign(metres)], [lng - 0.0001, edge]]],
  }
  return s
}

/**
 * The way hintuans are really drawn: on the roadside, not across the road.
 * A box whose edge is 2 m from the line is passed; the one on the other
 * carriageway, 12 m away, is not — the 5 m rule tells the two sides apart.
 * The Fatima box has an informal name and shares its place with another box,
 * so it reads "Fatima – Fatima Church side".
 */
export const PassesBesideTheRoad: Story = {
  args: {
    stops: [
      ...stops,
      roadside('h-near', 'Fatima Church side', 121.0428, 2, 'Fatima'),
      roadside('h-far', 'Fatima', 121.0428, -12),
      roadside('h-near-2', 'Pangarap', 121.0422, 3),
    ],
  },
}
