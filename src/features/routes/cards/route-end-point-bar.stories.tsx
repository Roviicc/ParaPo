import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { RouteEndPointBar } from './route-end-point-bar'
import { CARD_SURFACE, CARD_TEXT } from './livery-card'

const meta = {
  title: 'Features/Routes/RouteEndPointBar',
  component: RouteEndPointBar,
  args: { routeDirection: 'SM Fairview', on: 'surface', onClick: fn() },
  decorators: [(Story) => <div className="w-96 bg-surface p-3"><Story /></div>],
} satisfies Meta<typeof RouteEndPointBar>

export default meta
type Story = StoryObj<typeof meta>

/** On the sheet, as a trip's "Other routes" row: rounded, pressing grey; a tap calls onClick. */
export const OnSurface: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'SM Fairview' }))
    await expect(args.onClick).toHaveBeenCalled()
  },
}

/** On a red RouteCard: its words, pressing to Card/red/Timeline/surface. */
export const OnRed: Story = {
  args: { on: 'red' },
  decorators: [(Story) => <div className={'w-96 ' + CARD_SURFACE.red + ' ' + CARD_TEXT.red}><Story /></div>],
}

/** On a yellow RouteCard: near-black words. */
export const OnYellow: Story = {
  args: { on: 'yellow' },
  decorators: [(Story) => <div className={'w-96 ' + CARD_SURFACE.yellow + ' ' + CARD_TEXT.yellow}><Story /></div>],
}

/** A long place wraps under itself, the arrow staying at its first line's side. */
export const LongName: Story = { args: { routeDirection: 'Bagong Silang Kanan 5 Phase 3 Package 2 Terminal' } }
