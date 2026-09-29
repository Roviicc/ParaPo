import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { StopTimeline } from './StopTimeline'
import type { Timeline } from '../model/stops'

/** Sample rows only, shaped like a direction's timeline. Not read from anywhere. */
const timeline: Timeline = {
  from: { id: 'tala', label: 'Tala', kind: 'terminal' },
  to: { id: 'novaliches', label: 'Novaliches', kind: 'hintuan' },
  between: [
    { id: 'barracks', label: 'Barracks', kind: 'hintuan' },
    { id: 'malaria', label: 'Malaria', kind: 'hintuan' },
    { id: 'pangarap', label: 'Pangarap', kind: 'hintuan' },
    { id: 'amparo', label: 'Amparo', kind: 'hintuan' },
    { id: 'fatima', label: 'Fatima', kind: 'hintuan' },
    { id: 'lagro', label: 'Lagro', kind: 'hintuan' },
  ],
}

const meta = {
  title: 'Shared/StopTimeline',
  component: StopTimeline,
  decorators: [
    (Story) => (
      <div className="w-80 rounded-lg bg-neutral-50 px-3 py-2">
        <Story />
      </div>
    ),
  ],
  args: { timeline },
} satisfies Meta<typeof StopTimeline>

export default meta
type Story = StoryObj<typeof meta>

/** Rows are buttons: tapping one previews the ride up to it. */
export const Tappable: Story = { args: { onPick: fn() } }

/** A ride cut short at Amparo: it reads as the end, the rows past it fade. */
export const GetOffPicked: Story = { args: { onPick: fn(), pickedId: 'amparo' } }

/** Without onPick the rows are plain text — the save panel's preview. */
export const ReadOnly: Story = {}
