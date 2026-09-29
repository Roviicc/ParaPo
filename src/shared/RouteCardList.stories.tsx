import type { ComponentProps } from 'react'
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { RouteCardList } from './RouteCardList'
import type { VariantSummary } from './routes'
import type { StopSummary } from './stops'

/** Sample data only, shaped like the published file. Not the real map. */
function route(id: string, name: string): VariantSummary['route'] {
  return { id, signboard: null, long_name: null, mode: 'jeepney', fare_note: null, head_stop_id: id + '-head', tail_stop_id: id + '-tail', via: null, name }
}

/**
 * One direction, its line `km` long straight north; `drawn` false leaves it
 * a slot.
 */
function variant(key: string, name: string, direction: string, km: number, reversed = false, drawn = true): VariantSummary {
  return {
    id: key + (reversed ? '-back' : '-out'),
    route_id: key + '-route',
    direction_name: direction,
    origin_terminal: null,
    destination_terminal: null,
    shape: drawn ? { type: 'LineString', coordinates: [[121.04, 14.7], [121.04, 14.7 + km / 111.2]] } : null,
    reversed,
    confidence: 'drawn',
    route: route(key + '-route', name),
  }
}

/** The owner's frames: two routes into Tala, and out of it the other way round. */
const talaRoutes: VariantSummary[] = [
  variant('a', 'Novaliches (Bayan) – Tala', 'Novaliches (Bayan) → Tala', 8.4),
  variant('a', 'Novaliches (Bayan) – Tala', 'Tala → Novaliches (Bayan)', 8.6, true),
  variant('b', 'SM Fairview – Tala', 'SM Fairview → Tala', 9.1),
  variant('b', 'SM Fairview – Tala', 'Tala → SM Fairview', 9.3, true),
]

/** Six places, for a list taller than the room. */
const many: VariantSummary[] = ['Novaliches (Bayan)', 'SM Fairview', 'Lagro', 'Fatima', 'Quiapo', 'Cubao'].flatMap((p, i) => [
  variant('m' + i, `${p} – Tala`, `${p} → Tala`, 3 + i * 2),
  variant('m' + i, `${p} – Tala`, `Tala → ${p}`, 3 + i * 2, true),
])

/** Their ways back still slots: nothing to SWITCH to. */
const oneWay: VariantSummary[] = [
  variant('c', 'Lagro – Fatima', 'Lagro → Fatima', 2.5),
  variant('c', 'Lagro – Fatima', 'Fatima → Lagro', 2.5, true, false),
  variant('d', 'Lagro – Quiapo', 'Lagro → Quiapo', 16),
  variant('d', 'Lagro – Quiapo', 'Quiapo → Lagro', 16, true, false),
]

function stop(id: string, name: string, kind: StopSummary['kind'], informal: string | null = null): StopSummary {
  return { id, name, informal, aliases: [], kind, point: { type: 'Point', coordinates: [121.04, 14.7] }, area: null, note: null, created_at: '2026-09-12T00:00:00Z' }
}

/** Tala's terminal, where its routes run through it: the tap a terminal most often gets. */
const talaTerminal = stop('s1', 'Tala Jeepney Terminal', 'terminal', 'Tala')

/** Two boxes under one finger, and no line. */
const twoBoxes = [talaTerminal, stop('s2', 'Malaria', 'hintuan')]

/** One hintuan's two boxes, a mini stop either side of the road. */
const oneHintuan = [
  stop('s3', 'SM Fairview Main Babaan', 'hintuan', 'SM Fairview'),
  stop('s4', 'SM Fairview Main Sakayan', 'hintuan', 'SM Fairview'),
]

type Frame = 'phone' | 'tablet' | 'wide'
const FRAME = {
  phone: 'max-h-[852px] w-[393px]',
  tablet: 'max-h-[960px] w-[640px]',
  wide: 'max-h-[640px] w-[1024px]',
} satisfies Record<Frame, string>
const frameOf = (p: { frame?: Frame }) => FRAME[p.frame ?? 'phone']

/** Keeps the Selected card as the apps do, so a story can be tapped through; SWITCH lets it go. */
function Picking(props: ComponentProps<typeof RouteCardList>) {
  const [selected, setSelected] = useState(props.selected)
  const [back, setBack] = useState(props.back)
  return (
    <RouteCardList
      {...props}
      back={back}
      onFlip={() => {
        props.onFlip()
        setBack((b) => !b)
        setSelected(null)
      }}
      selected={selected}
      onSelect={(p) => {
        props.onSelect(p)
        setSelected(p?.from ?? null)
      }}
    />
  )
}

const meta = {
  title: 'Shared/RouteCardList',
  component: RouteCardList,
  render: (args) => <Picking {...args} />,
  // A map-sized box, marked @container as the apps' roots are: the list docks
  // along its bottom, and sits in the top-left corner from 1024 wide
  // (`@float:`) — the owner's frames at 393, 640 and 1024. Never taller than
  // the canvas, so the story itself does not scroll.
  decorators: [
    (Story, ctx) => (
      <div className={'relative h-dvh overflow-hidden bg-neutral-200 @container ' + frameOf(ctx.parameters)}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: { routes: talaRoutes, back: false, selected: null, onFlip: fn(), onSelect: fn(), onRoute: fn(), onStop: fn(), onClose: fn() },
} satisfies Meta<typeof RouteCardList>

export default meta
type Story = StoryObj<typeof meta>

/** On a phone, the way there: a card per place, docked along the bottom. The colours are drawn at random. */
export const Phone: Story = {}

/** SWITCHed: out of Tala both ways, one card — "1 Route". */
export const Switched: Story = { args: { back: true } }

/** Tala's card picked: pressed in, its routes alone lit on the map (the owner, 2026-09-29). */
export const ACardSelected: Story = { args: { back: true, selected: 'Tala' } }

/** From 1024 wide, flush in the top-left corner, 384 wide (the owner's 3750:1911). */
export const Floating: Story = { parameters: { frame: 'wide' } }

/** The owner's 640 frame: still docked, as wide as the screen — the glow runs edge to edge. */
export const Tablet: Story = { parameters: { frame: 'tablet' } }

/** Taller than the room: the cards scroll under the header. */
export const ManyPlaces: Story = { args: { routes: many } }

/** The other way round is not drawn yet: SWITCH rests disabled. */
export const NothingTheOtherWay: Story = { args: { routes: oneWay } }

/**
 * A tap on a hotspot with routes running through it: the hotspot first, as
 * the Chooser's row until the owner's hintuan design, then the cards. The
 * count stays the routes' (his pick, 2026-09-29).
 */
export const WithAHotspot: Story = { args: { stops: [talaTerminal] } }

/** The same, from 1024 wide. */
export const WithAHotspotFloating: Story = { args: { stops: [talaTerminal] }, parameters: { frame: 'wide' } }

/** Two boxes and no line: "2 Hotspots", with no route to count (the owner, 2026-09-29), and nothing to SWITCH. */
export const TwoHotspots: Story = { args: { routes: [], stops: twoBoxes } }

/** Both boxes of one hintuan and no line: a row each, and "1 Hotspot", as a rider counts it (hotspotCount; the owner, 2026-09-29). */
export const OneHintuanTwoBoxes: Story = { args: { routes: [], stops: oneHintuan } }
