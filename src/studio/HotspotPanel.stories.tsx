import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import type { LngLat } from '../shared/geo'
import type { StopRow } from '../shared/stops'
import { HotspotPanel } from './HotspotPanel'
import type { Drawing } from './useDrawing'

/** Sample data only, shaped like saved rows. Not read from Supabase. */
function stop(id: string, name: string, kind: StopRow['kind'], informal: string | null = null): StopRow {
  return {
    id,
    owner_id: 'sample-owner',
    name,
    informal,
    aliases: [],
    kind,
    point: { type: 'Point', coordinates: [121.0424, 14.741507] },
    area: null,
    note: null,
    created_at: '2026-09-21T00:00:00Z',
  }
}

/** The hotspots already saved: what the informal-name box offers while typing. */
const stops: StopRow[] = [
  stop('s-tala', 'Tala Jeepney Terminal', 'terminal', 'Tala'),
  stop('s-fairview-a', 'SM Fairview Terminal A', 'terminal', 'SM Fairview'),
  stop('s-malaria', 'Malaria', 'hintuan'),
]

/**
 * Just the parts of a drawing the panel reads: a four-corner outline and which
 * kind it is. Sample data only: a story has no Supabase client, so pressing
 * Save here shows an error and writes nothing.
 */
function outline(kind: 'terminal' | 'hintuan', stopId: string | null = null): Drawing {
  const [x, y] = [121.0424, 14.741507]
  const d = 0.0003
  const controlPoints: LngLat[] = [
    [x - d, y - d],
    [x + d, y - d],
    [x + d, y + d],
    [x - d, y + d],
  ]
  return { controlPoints, segments: [], area: { kind, stopId }, uTurns: [] } as unknown as Drawing
}

const meta = {
  title: 'Studio/HotspotPanel',
  component: HotspotPanel,
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
    draw: outline('hintuan'),
    existing: null,
    existingLinks: [],
    variants: [],
    stops,
    onSaved: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof HotspotPanel>

export default meta
type Story = StoryObj<typeof meta>

/** A new hintuan. The name is what is on the ground; the informal name is what people say, offered from the ones in use. */
export const NewHintuan: Story = {}

/** A new terminal: the same two names, and the note that a place has one terminal. */
export const NewTerminal: Story = {
  args: { draw: outline('terminal') },
}

/** Editing a saved terminal that already carries both names and two aliases. */
export const EditTerminal: Story = {
  args: {
    draw: outline('terminal', 's-tala'),
    existing: { ...stops[0], aliases: ['Tala Terminal', 'Terminal Tala'] },
  },
}
