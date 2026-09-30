import type { ComponentProps } from 'react'
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { HintuanCard } from './HintuanCard'
import type { RouteSummary, VariantSummary } from '../model/routes'
import type { StopSummary } from '../model/stops'

/*
 * Sample data only, shaped like saved rows: SM Fairview as the owner drew it
 * in 3854:12690 — a terminal, Fairview Teraccess on each side of the road,
 * SM Fairview Main and its babaan — and two routes from Tala, each both ways.
 */
const route = (id: string, name: string, tail: string): RouteSummary => ({
  id,
  signboard: null,
  long_name: null,
  mode: 'jeepney',
  fare_note: null,
  head_stop_id: 'tala',
  tail_stop_id: tail,
  via: null,
  name,
})

const direction = (id: string, r: RouteSummary, name: string, reversed: boolean): VariantSummary => ({
  id,
  route_id: r.id,
  direction_name: name,
  origin_terminal: null,
  destination_terminal: null,
  // A line, so it counts as drawn: the cards list drawn directions only.
  shape: { type: 'LineString', coordinates: [[121.04, 14.7], [121.06, 14.73]] },
  reversed,
  confidence: 'drawn',
  route: r,
})

const fairview = route('r-fairview', 'Tala – SM Fairview', 't')
const novaliches = route('r-novaliches', 'Tala – Novaliches', 'novaliches')
const fvOut = direction('fv-out', fairview, 'Tala → SM Fairview', false)
const fvIn = direction('fv-in', fairview, 'SM Fairview → Tala', true)
const nvOut = direction('nv-out', novaliches, 'Tala → Novaliches', false)
const nvIn = direction('nv-in', novaliches, 'Novaliches → Tala', true)

const box = (id: string, name: string, kind: StopSummary['kind'], at: [number, number], created_at: string): StopSummary => ({
  id,
  name,
  informal: 'SM Fairview',
  aliases: [],
  kind,
  point: { type: 'Point', coordinates: at },
  area: null,
  note: null,
  created_at,
})

const terminal = box('t', 'SM City Fairview Jeepney Terminal', 'terminal', [121.061, 14.7345], '2026-09-12T00:00:00Z')
const teraccess1 = box('h1', 'Fairview Teraccess', 'hintuan', [121.06, 14.734], '2026-09-13T00:00:00Z')
const main = box('h2', 'SM Fairview Main', 'hintuan', [121.062, 14.735], '2026-09-14T00:00:00Z')
const babaan = box('h3', 'SM Fairview Main Babaan', 'hintuan', [121.0621, 14.7352], '2026-09-15T00:00:00Z')
// Across the road from the first, drawn later: Fairview Teraccess 2.
const teraccess2 = box('h4', 'Fairview Teraccess', 'hintuan', [121.0602, 14.7342], '2026-09-16T00:00:00Z')
const stops = [terminal, teraccess1, main, babaan, teraccess2]

/** What stops at each box: the terminal both ways; each side of the road one way. */
const links: Record<string, string[]> = {
  t: ['fv-out', 'fv-in'],
  h1: ['fv-out', 'nv-out'],
  h4: ['fv-in', 'nv-in'],
  h2: ['fv-out'],
  h3: [],
}

/** Picks another box as the public map does: that row Selected, the Selected RouteCard let go. */
function Picking(props: ComponentProps<typeof HintuanCard>) {
  const [stop, setStop] = useState(props.stop)
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <HintuanCard
      {...props}
      stop={stop}
      routeCards={{
        ...props.routeCards,
        selected,
        onSelect: (p) => {
          props.routeCards.onSelect(p)
          setSelected(p?.from ?? null)
        },
      }}
      onPickBox={(id) => {
        props.onPickBox(id)
        setSelected(null)
        setStop(stops.find((s) => s.id === id) ?? stop)
      }}
    />
  )
}

const meta = {
  title: 'Shared/HintuanCard',
  component: HintuanCard,
  render: (args) => <Picking {...args} />,
  // A map-sized box to sit in; `phone` shrinks it to a handset, where the
  // card is a bottom sheet.
  decorators: [
    (Story, ctx) => (
      <div
        className={
          ctx.parameters.phone
            ? 'relative h-[800px] w-[390px] overflow-clip bg-neutral-200 @container'
            : 'relative h-[48rem] bg-neutral-200 @container'
        }
      >
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    stop: terminal,
    stops,
    linkedVariantIds: (id: string) => links[id] ?? [],
    variants: [fvOut, fvIn, nvOut, nvIn],
    onSelectVariant: fn(),
    routeCards: { selected: null, onSelect: fn(), onShown: fn() },
    onPickBox: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof HintuanCard>

export default meta
type Story = StoryObj<typeof meta>

const selectedRow = (canvas: HTMLElement) =>
  within(canvas).getAllByTestId('card-box').find((b) => b.getAttribute('aria-current') === 'true')

/**
 * Figma's Default: the terminal tapped, pressed in; the terminal first, then
 * the hintuans in the order drawn, the two Fairview Teraccess numbered.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const names = within(canvasElement).getAllByTestId('card-box').map((b) => b.textContent)
    await expect(names).toEqual([
      'SM City Fairview Jeepney Terminal',
      'Fairview Teraccess 1',
      'SM Fairview Main',
      'SM Fairview Main Babaan',
      'Fairview Teraccess 2',
    ])
    await expect(selectedRow(canvasElement)?.textContent).toBe('SM City Fairview Jeepney Terminal')
  },
}

/** Figma's Variant2: Fairview Teraccess 2 tapped — the routes stopping there, the way back to Tala. */
export const Variant2: Story = {
  args: { stop: teraccess2 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('card-count').textContent).toBe('2 routes pass through')
  },
}

/** A tap on a row picks that box, and the routes stopping there with it. */
export const PickARow: Story = {
  args: { stop: teraccess1 },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('SM Fairview Main'))
    await expect(args.onPickBox).toHaveBeenCalledWith('h2')
    await expect(selectedRow(canvasElement)?.textContent).toBe('SM Fairview Main')
    await expect(canvas.getByTestId('card-count').textContent).toBe('1 route passes through')
  },
}

/**
 * SWITCH at a box passed one way only: the other way round, at the nearest
 * box of the place passed that way — across the road, Fairview Teraccess 2.
 */
export const SwitchMovesAcross: Story = {
  args: { stop: teraccess1 },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByTestId('card-flip'))
    await expect(args.onPickBox).toHaveBeenCalledWith('h4')
    await expect(selectedRow(canvasElement)?.textContent).toBe('Fairview Teraccess 2')
    await expect(canvas.getByTestId('card-flip').getAttribute('aria-pressed')).toBe('true')
  },
}

/** SWITCH at a box passed both ways — the terminal — stays there. */
export const SwitchStays: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByTestId('card-flip'))
    await expect(args.onPickBox).not.toHaveBeenCalled()
    await expect(canvas.getByTestId('card-flip').getAttribute('aria-pressed')).toBe('true')
  },
}

/** No box of the place is passed the other way round: SWITCH rests disabled. */
export const SwitchDisabled: Story = {
  args: { stop: teraccess1, stops: [teraccess1, main] },
  play: async ({ canvasElement, args }) => {
    const flip = within(canvasElement).getByTestId('card-flip')
    await expect(flip).toBeDisabled()
    await userEvent.click(flip)
    await expect(args.onPickBox).not.toHaveBeenCalled()
  },
}

/** A box no route stops at yet: its rows, and no counter. */
export const NoRoutes: Story = {
  args: { stop: babaan },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByTestId('card-count')).toBeNull()
  },
}

/** A place of one box: its row alone. */
export const OneBox: Story = {
  args: { stop: { ...main, informal: 'Bestlink', name: 'Bestlink' }, stops: [{ ...main, informal: 'Bestlink', name: 'Bestlink' }] },
}

/** On a phone: a bottom sheet at Middle. */
export const Phone: Story = { args: { stop: teraccess2 }, parameters: { phone: true } }
