import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { WhereAmIButton } from './WhereAmI'
import type { WhereAmI } from './useWhereAmI'

/** A hand-made hook state: the button is pure display over it. */
const where = (status: WhereAmI['status'], follow = false, noFix = false): WhereAmI => ({
  status,
  fix:
    status === 'on'
      ? { at: [121.0467, 14.7478], accuracy: 12, speed: 0, heading: null, time: 0 }
      : null,
  pose: 'standing',
  facing: 'down',
  follow,
  noFix,
  ask: fn(),
  stop: fn(),
})

const meta = {
  title: 'Commuter/WhereAmIButton',
  component: WhereAmIButton,
  decorators: [
    (Story) => (
      <div className="relative h-56 w-72 bg-neutral-200">
        <Story />
      </div>
    ),
  ],
  args: { coarse: false },
} satisfies Meta<typeof WhereAmIButton>

export default meta
type Story = StoryObj<typeof meta>

/** Off: an outline, waiting to be asked. */
export const Off: Story = { args: { where: where('off') } }

/** On and following the visitor: filled. */
export const Following: Story = { args: { where: where('on', true) } }

/** On, but the visitor dragged the map away: outlined in blue, a tap follows again. */
export const LetGo: Story = { args: { where: where('on', false) } }

/** The browser said no: a short note, and the button stays plain to try again. */
export const Denied: Story = { args: { where: where('denied') } }

/** Asked, the first fix not in yet: on, and following. */
export const Asking: Story = { args: { where: where('asking', true) } }

/** A browser with no location at all: a note, and the button plain. */
export const Unavailable: Story = { args: { where: where('unavailable') } }

/** On a phone: a finger's row lower, under the credit line. */
export const OnAPhone: Story = { args: { where: where('off'), coarse: true } }

/** Asking, and no fix has come yet: still on (a tap turns it off), with a note. */
export const NoFixYet: Story = { args: { where: where('asking', true, true) } }
