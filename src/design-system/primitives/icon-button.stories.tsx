import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { IconButton } from './icon-button'

/** The set's default icon, the same navigation arrow Button's stories use. */
const NavIcon = (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path d="M17.8 2.2a.75.75 0 0 1 .17.8l-5.6 14.4a.75.75 0 0 1-1.4-.03l-2.03-5.55-5.55-2.03a.75.75 0 0 1-.03-1.4L17 2.03a.75.75 0 0 1 .8.17Z" />
  </svg>
)

const meta = {
  title: 'DesignSystem/Primitives/IconButton',
  component: IconButton,
  args: { icon: NavIcon, label: 'Go', onClick: fn() },
} satisfies Meta<typeof IconButton>

export default meta
type Story = StoryObj<typeof meta>

/** Special, 40px: Button's jeepney pill with only the icon. Hover and press wear the Special shadows. */
export const Special: Story = {}

/** 32px, a 20px icon. */
export const Small: Story = { args: { size: 'small' } }

/** Opacity/60 and truly disabled: hover and press leave the button as it is, but its tooltip still names it. */
export const Disabled: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <IconButton icon={NavIcon} label="Go" disabled />
      <IconButton icon={NavIcon} label="Go" size="small" disabled />
    </div>
  ),
}

/**
 * Hover one: after delay/tooltip its label shows as the Tooltip, on the side
 * the screen asked for (the prop names the arrow's side, as the Tooltip set
 * does). Never on a phone.
 */
export const TooltipSides: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-x-40 gap-y-20 p-16">
      <IconButton icon={NavIcon} label="Where am I" tooltip="bottom" />
      <IconButton icon={NavIcon} label="Where am I" tooltip="top" />
      <IconButton icon={NavIcon} label="Where am I" tooltip="left" />
      <IconButton icon={NavIcon} label="Where am I" tooltip="right" />
    </div>
  ),
}

/**
 * A real specimen: a round control floating on the map at phone width, the
 * way "Where am I" sits over it today. At the screen's edge the screen picks
 * the side facing away from it — Right, so the bubble opens to the left.
 */
export const MapSpecimen: Story = {
  render: () => (
    <div className="relative h-56 w-[390px] overflow-hidden bg-neutral-200 @container">
      <div className="absolute right-3 bottom-3 flex flex-col items-end gap-2">
        <IconButton icon={NavIcon} label="Where am I" tooltip="right" />
        <IconButton icon={NavIcon} label="Where am I" size="small" tooltip="right" />
      </div>
    </div>
  ),
}
