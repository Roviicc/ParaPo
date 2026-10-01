import type { Meta, StoryObj } from '@storybook/react-vite'
import { BEAM_DRAWN_DEG, LocatorIndicatorOverlay } from './LocatorIndicatorOverlay'
import type { Face, Mood } from './locatorMood'

const meta = {
  title: 'Commuter/LocatorIndicatorOverlay',
  component: LocatorIndicatorOverlay,
  decorators: [
    (Story) => (
      <div className="grid min-h-80 min-w-80 place-items-center overflow-clip bg-neutral-200">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LocatorIndicatorOverlay>

export default meta
type Story = StoryObj<typeof meta>

/** As the owner drew it (3870:5247): a 240 circle with its hairline, the beam pointing south. */
export const AsDrawn: Story = { args: { haloPx: 240, beamDeg: BEAM_DRAWN_DEG } }

/** Facing up the screen. */
export const FacingUp: Story = { args: { haloPx: 240, beamDeg: 0 } }

/** No heading yet — no compass, and the fixes have shown none: no beam. */
export const NoHeading: Story = { args: { haloPx: 240, beamDeg: null } }

/** A good fix zoomed out: the circle would hide under the dot, so it is gone. */
export const TightFix: Story = { args: { haloPx: 12, beamDeg: 300 } }

/** Zoomed out to the city: the dot and beam at their smallest, as Google Maps' (indicatorScale). */
export const ZoomedOut: Story = { args: { haloPx: 0, beamDeg: 30, scale: 0.54 } }

/*
 * Its moods and faces (locatorMood.ts, the owner's ask of 2026-10-01): every
 * face it can wear, side by side, for him to look over; each a story too.
 */
const face = (mood: Mood, f: Face): Story => ({ args: { haloPx: 0, beamDeg: null, mood, face: f } })

/** Neutral, mostly: the wandering glance, as drawn. */
export const NeutralGlance = face('neutral', 'glance')
/** Neutral: a curious look up, one eye wider. */
export const NeutralCurious = face('neutral', 'curious')
/** Neutral: a wink. */
export const NeutralWink = face('neutral', 'wink')
/** Neutral: wide-eyed. */
export const NeutralSurprised = face('neutral', 'surprised')
/** Neutral, a minute standing still: dozing. */
export const NeutralSleepy = face('neutral', 'sleepy')
/** Happy: smiling eyes. */
export const HappySmile = face('happy', 'smile')
/** Happy: smiling, hopping. */
export const HappyHop = face('happy', 'hop')
/** Happy: squeezed > <. */
export const HappySquee = face('happy', 'squee')
/** Happy: a smile and a wink. */
export const HappyWinkSmile = face('happy', 'wink-smile')
/** Sad, the fix stale or rough: eyes down, brows up at the middle. */
export const SadDroop = face('sad', 'droop')
/** Cross, at a run of taps: eyes narrowed, brows down at the middle, a shake. */
export const AngryGlare = face('angry', 'glare')
/** A tap on the button, glad: squashed, up with smiling eyes, landing with a wobble. */
export const TapBoing = face('happy', 'boing')
/** A tap on the button, now and then cross: puffed up, brows down, shaking it off. */
export const TapHuff = face('angry', 'huff')

const ALL: [Mood, Face][] = [
  ['neutral', 'glance'],
  ['neutral', 'curious'],
  ['neutral', 'wink'],
  ['neutral', 'surprised'],
  ['neutral', 'sleepy'],
  ['happy', 'smile'],
  ['happy', 'hop'],
  ['happy', 'squee'],
  ['happy', 'wink-smile'],
  ['sad', 'droop'],
  ['angry', 'glare'],
  ['happy', 'boing'],
  ['angry', 'huff'],
]

/** Every face at once, three times the size, named. */
export const AllFaces: Story = {
  args: { haloPx: 0, beamDeg: null },
  render: () => (
    <div className="grid grid-cols-4 gap-x-10 gap-y-12 p-10">
      {ALL.map(([m, f]) => (
        <div key={f} className="flex flex-col items-center gap-8">
          <div className="grid size-24 place-items-center" style={{ scale: 3 }}>
            <LocatorIndicatorOverlay haloPx={0} beamDeg={null} mood={m} face={f} />
          </div>
          <span className="text-xs text-content-tertiary">
            {m} · {f}
          </span>
        </div>
      ))}
    </div>
  ),
}
