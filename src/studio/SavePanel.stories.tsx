import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import type { LngLat, Segment } from '../shared/geo'
import { SavePanel } from './SavePanel'
import type { Drawing } from './useDrawing'

/**
 * Just the parts of a drawing the panel reads. Sample data only: pressing Save
 * here fails with "Supabase is not configured", and nothing is written.
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
