import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { RouteCardHeader } from './RouteCardHeader'

/**
 * The top of the route list and of a trip (Figma 3742:1049): Default, the
 * Jeep and the count, over a list; Variant2, ‹ back, over a trip. SWITCH is
 * pressed while the way back shows, and rests disabled when the other way
 * round has nothing drawn. Rendered by hand: its two shapes of props do not
 * make one set of args.
 */
const meta: Meta = {
  title: 'Shared/RouteCardHeader',
  decorators: [
    (Story) => (
      <div className="w-96 bg-neutral-200 p-4">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj

const common = { onSwitch: fn(), onClose: fn(), switchable: true, back: false }

/** Over the route list: the Jeep and the count. */
export const Default: Story = { render: () => <RouteCardHeader {...common} routeCount="2 Routes" /> }

/** Over the route list, one route. */
export const OneRoute: Story = { render: () => <RouteCardHeader {...common} routeCount="1 Route" /> }

/** A tap with only hotspots under it: their count. */
export const Hotspots: Story = { render: () => <RouteCardHeader {...common} routeCount="2 Hotspots" /> }

/** The way back showing: SWITCH pressed. */
export const WayBack: Story = { render: () => <RouteCardHeader {...common} back routeCount="2 Routes" /> }

/** Nothing drawn the other way round: SWITCH rests disabled. */
export const NothingToSwitchTo: Story = {
  render: () => <RouteCardHeader {...common} switchable={false} routeCount="1 Route" />,
}

/** Over a trip (Variant2): ‹ back to what it was picked from. */
export const OverATrip: Story = { render: () => <RouteCardHeader {...common} onBackToList={fn()} /> }

/** A trip opened on its own, no route sharing an end drawn its way round: no ‹. */
export const OverATripAlone: Story = { render: () => <RouteCardHeader {...common} onBackToList={null} /> }
