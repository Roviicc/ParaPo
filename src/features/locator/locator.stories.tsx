import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { BottomSheet } from '@/shared/ui/bottom-sheet'
import type { Snap } from '@/shared/ui/sheet-gesture'
import { Locator } from './locator'
import type { Locator as State } from './use-locator'

/** A hand-made hook state: the Locator is pure display over it. */
const locator = (over: Partial<State> = {}): State => ({
  status: 'on',
  fix: { at: [121.0467, 14.7478], accuracy: 12, speed: 0, heading: null, time: 0 },
  heading: null,
  compass: true,
  camera: 'free',
  mode: 'TrackOwnLocation',
  noFix: false,
  tap: fn(),
  taps: 0,
  ...over,
})

type Args = { snap: Snap | null; state: State; wide?: boolean }

/**
 * The owner's 393 × 852 frame, a page as the app's root is: the sheet says
 * where its top is here. `wide`: 1280 × 800, past `@float:`, the card
 * floating in the corner.
 */
function Specimen({ snap, state, wide = false }: Args) {
  return (
    <div data-dock-host className={'@container relative overflow-clip bg-neutral-200 ' + (wide ? 'h-[800px] w-[1280px]' : 'h-[852px] w-[393px]')}>
      <Locator locator={state} docked={snap !== null} />
      {snap !== null && (
        <BottomSheet label="A trip" testId="card" header={<p className="px-4 pb-3 font-bold">Novaliches</p>} onClose={fn()} height={{ snap, onSnap: fn() }}>
          <p className="px-4 text-sm">The trip's card.</p>
        </BottomSheet>
      )}
    </div>
  )
}

const meta = {
  title: 'Commuter/Locator',
  component: Specimen,
  parameters: { layout: 'fullscreen' },
  args: { snap: 'middle', state: locator() },
} satisfies Meta<typeof Specimen>

export default meta
type Story = StoryObj<typeof meta>

/** ScreenLocationBehavior (3870:5941): 12 above the sheet at Middle. */
export const AtMiddle: Story = {}

/** Following the sheet down to Low. */
export const AtLow: Story = { args: { snap: 'low' } }

/** The sheet let go past Middle: the button stays where Middle left it, under the sheet. */
export const AboveMiddle: Story = { args: { snap: 0.8 } }

/** At Max: the sheet covers it. */
export const AtMax: Story = { args: { snap: 'max' } }

/** Wide, the card in the corner: bottom right, clear of the credit line, wherever the card is. */
export const Wide: Story = { args: { wide: true, state: locator({ camera: 'tracked', mode: 'TrackedLocation', compass: false }) } }

/** No card: at the map's foot. */
export const NoCard: Story = { args: { snap: null, state: locator({ camera: 'tracked', mode: 'TrackedLocation', heading: 30 }) } }

/** The browser said no: a short note above the button. */
export const Denied: Story = { args: { state: locator({ status: 'denied', fix: null, mode: 'LocationOff' }) } }
