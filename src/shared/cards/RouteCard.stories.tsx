import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { RouteCard } from './RouteCard'

const meta = {
  title: 'Shared/RouteCard',
  component: RouteCard,
  // As wide as the list in the top-left corner: the card fills whatever holds it.
  decorators: [(Story) => <div className="w-96"><Story /></div>],
  args: {
    livery: 'red',
    state: 'rest',
    routeOrigin: 'Novaliches (Bayan)',
    endPoints: [{ id: 'a', routeDirection: 'Tala' }],
    onSelect: fn(),
    onPick: fn(),
    testId: 'chooser',
  },
} satisfies Meta<typeof RouteCard>

export default meta
type Story = StoryObj<typeof meta>

/** Red: Content/inverse under Route/RouteCardPrimary, the Primary Blob. */
export const Red: Story = {}

/** Orange — Figma's Pink, the Card/orange tokens. */
export const Orange: Story = { args: { livery: 'orange', routeOrigin: 'SM Fairview' } }

/** Yellow: Content/primary under Route/RouteCardInverse, the Inverse Blob. */
export const Yellow: Story = { args: { livery: 'yellow', routeOrigin: 'Lagro' } }

/** State=Selected, red: pressed in under Route/RouteCardPrimarySelected; nothing else changes. */
export const RedSelected: Story = { args: { state: 'selected' } }

/** Selected, orange: the same Primary shadow. */
export const OrangeSelected: Story = { args: { state: 'selected', livery: 'orange', routeOrigin: 'SM Fairview' } }

/** Selected, yellow: pressed in under Route/RouteCardInverseSelected. */
export const YellowSelected: Story = { args: { state: 'selected', livery: 'yellow', routeOrigin: 'Lagro' } }

/** Violet (2026-09-30): white words, as Red, under Yellow's Inverse shadow and Blob. */
export const Violet: Story = { args: { livery: 'violet', routeOrigin: 'Fairview' } }

/** Selected, violet: as Yellow. */
export const VioletSelected: Story = { args: { state: 'selected', livery: 'violet', routeOrigin: 'Fairview' } }

/** Rose (2026-09-30): as Violet. */
export const Rose: Story = { args: { livery: 'rose', routeOrigin: 'Novaliches' } }

/** Selected, rose: as Yellow. */
export const RoseSelected: Story = { args: { state: 'selected', livery: 'rose', routeOrigin: 'Novaliches' } }

/** Fuchsia (2026-09-30, Figma's Fuschia, in mist's place): as Violet. */
export const Fuchsia: Story = { args: { livery: 'fuchsia', routeOrigin: 'SM Fairview' } }

/** Selected, fuchsia: as Yellow. */
export const FuchsiaSelected: Story = { args: { state: 'selected', livery: 'fuchsia', routeOrigin: 'SM Fairview' } }

/**
 * At rest, a row opens its direction straight away; a tap anywhere else on
 * the card — its name, the room around its rows — selects it (the owner,
 * 2026-09-29).
 */
export const ARowOpens: Story = {
  args: { routeOrigin: 'Tala', endPoints: [{ id: 'a', routeDirection: 'SM Fairview' }, { id: 'b', routeDirection: 'Novaliches (Bayan)' }] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const doc = canvasElement.ownerDocument
    // A finger on a row lands on the row, drawn over the name's target.
    const row = canvas.getByText('Novaliches (Bayan)')
    const box = row.getBoundingClientRect()
    const under = doc.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    await expect(under?.closest('[data-testid]')?.getAttribute('data-testid')).toBe('chooser-item')
    await userEvent.click(row)
    await expect(args.onPick).toHaveBeenCalledWith('b')
    await expect(args.onSelect).not.toHaveBeenCalled()
    // Below the last row, the card's own room is the name's.
    const card = canvas.getByTestId('chooser-origin').getBoundingClientRect()
    const room = doc.elementFromPoint(card.x + card.width / 2, card.bottom - 3)
    await expect(room?.getAttribute('data-testid')).toBe('chooser-select')
    if (room) await userEvent.click(room)
    await expect(args.onSelect).toHaveBeenCalledTimes(1)
  },
}

/** Selected, a row still opens its direction; a tap on the card lets it go. */
export const SelectedRowsOpen: Story = {
  args: { ...ARowOpens.args, state: 'selected' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('Novaliches (Bayan)'))
    await expect(args.onPick).toHaveBeenCalledWith('b')
    await userEvent.click(canvas.getByRole('button', { name: 'Tala', pressed: true }))
    await expect(args.onSelect).toHaveBeenCalledTimes(1)
  },
}

/** One place, several ways out: a row each, each its own target. */
export const SeveralWaysOut: Story = {
  args: {
    routeOrigin: 'Tala',
    endPoints: [
      { id: 'a', routeDirection: 'SM Fairview' },
      { id: 'b', routeDirection: 'Novaliches (Bayan)' },
    ],
  },
}

/** The set's longest: six ways out — tall enough to show the glow fades out whole. */
export const SixWaysOut: Story = {
  args: {
    livery: 'orange',
    routeOrigin: 'SM Fairview',
    endPoints: ['Tala', 'Novaliches (Bayan)', 'Quiapo', 'Cubao', 'Lagro', 'Fatima'].map((p, i) => ({
      id: String(i),
      routeDirection: p,
    })),
  },
}

/** A place name too long for one line wraps; it is never cut. */
export const LongName: Story = {
  args: { livery: 'orange', routeOrigin: 'Fairview Teraccess Transport Terminal', endPoints: [{ id: 'a', routeDirection: 'Novaliches (Bayan) via Zabarte' }] },
}
