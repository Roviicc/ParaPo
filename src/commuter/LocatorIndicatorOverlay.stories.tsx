import type { Meta, StoryObj } from '@storybook/react-vite'
import { CONE_DRAWN_DEG, LocatorIndicatorOverlay } from './LocatorIndicatorOverlay'

const meta = {
  title: 'Commuter/LocatorIndicatorOverlay',
  component: LocatorIndicatorOverlay,
  decorators: [
    (Story) => (
      <div className="grid h-80 w-80 place-items-center overflow-clip bg-neutral-200">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LocatorIndicatorOverlay>

export default meta
type Story = StoryObj<typeof meta>

/** As the owner drew it (3870:5247): a 240 circle, the cone pointing south-east. */
export const AsDrawn: Story = { args: { haloPx: 240, coneDeg: CONE_DRAWN_DEG } }

/** Facing up the screen. */
export const FacingUp: Story = { args: { haloPx: 240, coneDeg: 0 } }

/** No heading yet — no compass, and the fixes have shown none: no cone. */
export const NoHeading: Story = { args: { haloPx: 240, coneDeg: null } }

/** A good fix zoomed out: the circle would hide under the dot, so it is gone. */
export const TightFix: Story = { args: { haloPx: 12, coneDeg: 300 } }

/** Zoomed out to the city: the dot and cone at their smallest, as Google Maps' (indicatorScale). */
export const ZoomedOut: Story = { args: { haloPx: 0, coneDeg: 30, scale: 0.45 } }
