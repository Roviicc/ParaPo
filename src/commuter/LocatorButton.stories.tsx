import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { LocatorButton } from './LocatorButton'

const meta = {
  title: 'Commuter/LocatorButton',
  component: LocatorButton,
  decorators: [
    (Story) => (
      <div className="grid min-h-40 min-w-40 place-items-center bg-neutral-200 p-6">
        <Story />
      </div>
    ),
  ],
  args: { onClick: fn(), 'aria-label': 'Show where I am' },
} satisfies Meta<typeof LocatorButton>

export default meta
type Story = StoryObj<typeof meta>

/** No location yet — not asked, refused, or no fix in: a tap asks the browser for it. */
export const LocationOff: Story = { args: { mode: 'LocationOff', 'aria-label': 'Turn on my location' } }

/** The camera is elsewhere: a tap brings it to the visitor. */
export const TrackOwnLocation: Story = { args: { mode: 'TrackOwnLocation' } }

/** The camera follows the visitor, north up: a tap turns on the compass. */
export const TrackedLocation: Story = { args: { mode: 'TrackedLocation', 'aria-label': 'Turn the map the way I face' } }

/** TrackedLocation with the phone facing east-north-east: its arrow turns with it. */
export const TrackedLocationTurned: Story = {
  args: { mode: 'TrackedLocation', heading: 60, 'aria-label': 'Turn the map the way I face' },
}

/** The camera tilted and turned with the phone: a tap puts north up again. */
export const TracksTheMapBasedOnCompassFacing: Story = {
  args: { mode: 'TracksTheMapBasedOnCompassFacing', 'aria-label': 'Put north up' },
}

/**
 * Pressed (InnerShadow/SpecialButtonPressed): shown only while touched, so
 * hold one to see it — the four side by side, as Figma's set lays them out.
 */
export const Pressed: Story = {
  args: { mode: 'TrackOwnLocation' },
  render: (args) => (
    <div className="flex gap-4">
      <LocatorButton {...args} mode="LocationOff" aria-label="Turn on my location" />
      <LocatorButton {...args} mode="TrackOwnLocation" aria-label="Show where I am" />
      <LocatorButton {...args} mode="TrackedLocation" aria-label="Turn the map the way I face" />
      <LocatorButton {...args} mode="TracksTheMapBasedOnCompassFacing" aria-label="Put north up" />
    </div>
  ),
}
