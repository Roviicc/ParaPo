import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import type { DirectionDrawing, RouteRow } from '@/features/routes/model/routes';
import type { LngLat, Segment } from '@/shared/utils/geo';

import { DrawToolbar } from './draw-toolbar';
import type { Drawing } from './use-drawing';

/** The sample line: Tala to SM Fairview, three points. */
const points: LngLat[] = [
  [121.043326, 14.742006],
  [121.04184, 14.742003],
  [121.0424, 14.741507],
];
const routed = (from: LngLat, to: LngLat): Segment => ({
  snap: 'snapped',
  coordinates: [from, to],
  streets: [{ name: 'Sinai Street', metres: 160 }],
});
const straight = (from: LngLat, to: LngLat): Segment => ({
  snap: 'freehand',
  coordinates: [from, to],
});

const talaFairview: RouteRow & { name: string } = {
  id: 'sample-route',
  ownerId: 'sample-owner',
  signboard: null,
  routeCode: null,
  shortName: null,
  longName: null,
  mode: 'jeepney',
  fareNote: null,
  fareAsOf: null,
  headHotspotId: 'sample-tala',
  tailHotspotId: 'sample-fairview',
  via: null,
  name: 'Tala – SM Fairview',
};

/** The saved direction an Extend starts from. */
const parent: DirectionDrawing = {
  id: 'sample-out',
  routeId: 'sample-route',
  ownerId: 'sample-owner',
  name: 'Tala → SM Fairview',
  originTerminal: null,
  destinationTerminal: null,
  shape: { type: 'LineString', coordinates: points },
  reversed: false,
  confidence: 'drawn',
  updatedAt: '2026-09-21T00:00:00Z',
  route: talaFairview,
  controlPoints: points,
  segments: [routed(points[0], points[1]), routed(points[1], points[2])],
};

/**
 * A drawing in memory, every part of it: sample data only, nothing routed or
 * saved. The buttons report through `fn()`; the toolbar is drawn from what is
 * passed, so a story sets the state it shows rather than reaching it.
 */
function drawing(state: Partial<Drawing> = {}): Drawing {
  return {
    drawing: true,
    controlPoints: [],
    segments: [],
    line: [],
    snapping: 0,
    unresolved: false,
    freehand: false,
    setFreehand: fn(),
    target: { routeId: null, directionId: null },
    area: null,
    borrow: null,
    picking: null,
    startExtend: fn(),
    keep: fn(),
    joinGate: fn(),
    connect: fn(),
    lineNow: fn(() => []),
    uTurns: [],
    load: fn(),
    metres: 0,
    start: fn(),
    startArea: fn(),
    loadArea: fn(),
    adoptHotspot: fn(),
    cancel: fn(),
    undo: fn(),
    addPoint: fn(),
    insertPoint: fn(),
    deletePoint: fn(),
    toggleSegment: fn(() => Promise.resolve()),
    selected: null,
    select: fn(),
    deleteSelected: fn(),
    canPutBack: false,
    putBack: fn(),
    followOffer: null,
    takeFollowOffer: fn(),
    ...state,
  };
}

/** Three points routed along the streets, 640 m of line. */
const drawn = (state: Partial<Drawing> = {}) =>
  drawing({
    controlPoints: points,
    segments: [routed(points[0], points[1]), routed(points[1], points[2])],
    line: points,
    metres: 640,
    ...state,
  });

/**
 * Matches `(pointer: coarse)` for one story, so the toolbar takes the
 * finger's path: its hint in a pill, ✕ asking first.
 */
const asFinger = () => {
  const real = window.matchMedia;
  window.matchMedia = (query: string) => {
    // Each call answers a fresh list, so changing this one touches nothing else.
    const list = real.call(window, query);
    return query === '(pointer: coarse)'
      ? Object.defineProperty(list, 'matches', { value: true })
      : list;
  };
  return () => {
    window.matchMedia = real;
  };
};

const meta = {
  title: 'Features/Studio/DrawToolbar',
  component: DrawToolbar,
  // The toolbar sits at the foot of the map. The `phone` parameter gives it
  // a handset's width instead, as card-actions.stories.tsx does.
  decorators: [
    (Story, ctx) => (
      <div
        className={
          ctx.parameters.phone
            ? 'relative h-160 w-[390px] bg-surface-quaternary'
            : 'relative h-96 bg-surface-quaternary'
        }
      >
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: { draw: drawn(), onDone: fn() },
} satisfies Meta<typeof DrawToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing placed yet: Undo and Done rest, and a mouse is told nothing until the first point. */
export const Empty: Story = {
  args: { draw: drawing() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: '↶ Undo' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: '✓ Done' })).toBeDisabled();
  },
};

/** One point: Done still rests, and says why in its title. */
export const OnePoint: Story = {
  args: { draw: drawing({ controlPoints: [points[0]], segments: [], line: [points[0]] }) },
  play: async ({ canvasElement }) => {
    const done = within(canvasElement).getByRole('button', { name: '✓ Done' });
    await expect(done).toBeDisabled();
    await expect(done).toHaveAttribute('title', 'Add at least 2 points');
  },
};

/** A route of three points: its length, the mouse's hint, and Done open. */
export const Drawn: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '✓ Done' }));
    await expect(args.onDone).toHaveBeenCalledOnce();
    await expect(canvas.getByText(/3 points · 640 m/)).toBeVisible();
  },
};

/** Enter is Done, and Ctrl+Z is Undo, while no panel is open. */
export const Keys: Story = {
  play: async ({ args }) => {
    // The keys are bound in an effect, which can land after play has started:
    // press until they are.
    await waitFor(async () => {
      await userEvent.keyboard('{Enter}');
      await expect(args.onDone).toHaveBeenCalled();
    });
    await userEvent.keyboard('{Control>}z{/Control}');
    await expect(args.draw.undo).toHaveBeenCalledOnce();
  },
};

/**
 * Lets the toolbar's effects land, so a key pressed after it would reach a
 * bound listener if there were one.
 */
const settled = () => new Promise((resolve) => setTimeout(resolve, 50));

/** With a panel open the keys belong to it: Enter and Ctrl+Z do nothing here. */
export const KeysOff: Story = {
  args: { keys: false },
  play: async ({ args }) => {
    await settled();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Control>}z{/Control}');
    await expect(args.onDone).not.toHaveBeenCalled();
    await expect(args.draw.undo).not.toHaveBeenCalled();
  },
};

/** Enter on a focused button presses that button, and is not Done (review of 2026-10-03). */
export const EnterOnAButton: Story = {
  play: async ({ canvasElement, args }) => {
    await settled();
    within(canvasElement).getByRole('button', { name: '↶ Undo' }).focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.draw.undo).toHaveBeenCalledOnce();
    await expect(args.onDone).not.toHaveBeenCalled();
  },
};

/** Draw picked, and one stretch already straight: the count says so. */
export const WithAStraightStretch: Story = {
  args: {
    draw: drawn({
      freehand: true,
      segments: [routed(points[0], points[1]), straight(points[1], points[2])],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Draw' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(canvas.getByText(/1 straight/)).toBeVisible();
  },
};

/** Waiting for the router: snapping… in rose, and Done rests until the line is road. */
export const Snapping: Story = {
  args: { draw: drawn({ snapping: 1 }) },
  play: async ({ canvasElement }) => {
    const done = within(canvasElement).getByRole('button', { name: '✓ Done' });
    await expect(done).toBeDisabled();
    await expect(done).toHaveAttribute('title', 'Waiting for the router');
  },
};

/**
 * A stand-in still on the line with nothing snapping: Done waits for the
 * router all the same, without the snapping… note.
 */
export const WaitingForTheLine: Story = {
  args: { draw: drawn({ unresolved: true }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: '✓ Done' })).toHaveAttribute(
      'title',
      'Waiting for the router',
    );
    await expect(canvas.queryByText(/snapping/)).toBeNull();
  },
};

/** A U-turn ringed on the map: the count's warning opens what it means. */
export const WithAUTurn: Story = {
  args: { draw: drawn({ uTurns: [{ point: 1, stub: [], metres: 60 }] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /1 U-turn/ }));
    await expect(canvas.getByText(/turns back on itself at the ringed point,/)).toBeVisible();
  },
};

/** Two U-turns: the plural, and the plural help. */
export const WithTwoUTurns: Story = {
  args: {
    draw: drawn({
      uTurns: [
        { point: 1, stub: [], metres: 60 },
        { point: 2, stub: [], metres: 45 },
      ],
    }),
  },
};

/**
 * A long route at its longest labels: kilometres, many points, straight
 * stretches and U-turns at once — the count must still fit.
 */
export const LongContent: Story = {
  args: {
    draw: drawn({
      controlPoints: Array.from({ length: 48 }, (_, i): LngLat => [121 + i / 1000, 14.74]),
      segments: [straight(points[0], points[1]), straight(points[1], points[2])],
      metres: 12_345,
      uTurns: [
        { point: 3, stub: [], metres: 60 },
        { point: 9, stub: [], metres: 45 },
      ],
    }),
  },
};

/** Tracing a terminal: corners, not points, three needed, and no Tap | Draw. */
export const TerminalOutline: Story = {
  args: {
    draw: drawing({
      area: { kind: 'terminal', hotspotId: null },
      controlPoints: points.slice(0, 2),
      line: points.slice(0, 2),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId('tap-draw')).toBeNull();
    await expect(canvas.getByRole('button', { name: '✓ Done' })).toHaveAttribute(
      'title',
      'Add at least 3 corners',
    );
  },
};

/** A hintuan's outline with its four corners: ready to save. */
export const HintuanOutline: Story = {
  args: {
    draw: drawing({
      area: { kind: 'hintuan', hotspotId: null },
      controlPoints: [...points, [121.0435, 14.7415]],
    }),
  },
};

/** Extend, before a spot is tapped: the bar asks for one. */
export const ExtendPickASpot: Story = {
  args: { draw: drawing({ picking: { direction: parent, spot: null } }) },
};

/** Extend from a line whose ends are not known: the buttons say the start and the end. */
export const ExtendWithoutEnds: Story = {
  args: {
    draw: drawing({
      picking: {
        direction: parent,
        spot: { seg: 0, edge: 0, point: points[1], metres: 160 },
      },
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('keep-start')).toHaveTextContent('Keep the start → here');
    await expect(canvas.getByTestId('keep-end')).toHaveTextContent('Keep here → the end');
  },
};

/** Extend, a spot tapped: keep the part before it or after it, named in travel order. */
export const ExtendKeepAPart: Story = {
  args: {
    draw: drawing({
      picking: {
        direction: parent,
        spot: { seg: 0, edge: 0, point: points[1], metres: 160 },
      },
    }),
    ends: { from: 'Tala', to: 'SM Fairview', backwards: false },
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Keep Tala → here/ }));
    await expect(args.draw.keep).toHaveBeenCalledWith('start');
  },
};

/** The stored line runs the other way round: the same words keep the other part. */
export const ExtendKeepAPartBackwards: Story = {
  args: {
    draw: drawing({
      picking: {
        direction: parent,
        spot: { seg: 0, edge: 0, point: points[1], metres: 160 },
      },
    }),
    ends: { from: 'SM Fairview', to: 'Tala', backwards: true },
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: /Keep SM Fairview → here/ }),
    );
    await expect(args.draw.keep).toHaveBeenCalledWith('end');
  },
};

/** Ends with long names: the keep buttons wrap inside the map's width. */
export const ExtendLongNames: Story = {
  args: {
    draw: drawing({
      picking: {
        direction: parent,
        spot: { seg: 0, edge: 0, point: points[1], metres: 2_480 },
      },
    }),
    ends: {
      from: 'SM City Fairview Public Transport Terminal',
      to: 'Quezon City Hall Interim Terminal',
      backwards: false,
    },
  },
};

/** Under a finger, nothing placed: the hint is a pill, and says what a tap does. */
export const FingerEmpty: Story = {
  args: { draw: drawing() },
  beforeEach: asFinger,
};

/** Under a finger, one point placed: the count says what Done still needs. */
export const FingerOnePoint: Story = {
  args: { draw: drawing({ controlPoints: [points[0]], line: [points[0]] }) },
  beforeEach: asFinger,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/add at least 2 points/)).toBeVisible();
  },
};

/** Under a finger, a hotspot not yet begun: tap its corners. */
export const FingerHotspot: Story = {
  args: { draw: drawing({ area: { kind: 'terminal', hotspotId: null } }) },
  beforeEach: asFinger,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Tap the corners of the hotspot')).toBeVisible();
  },
};

/** Under a finger, ✕ on a hotspot's outline asks about the hotspot. */
export const FingerConfirmDiscardHotspot: Story = {
  args: {
    draw: drawing({
      area: { kind: 'hintuan', hotspotId: null },
      controlPoints: [...points, [121.0435, 14.7415]],
    }),
  },
  beforeEach: asFinger,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '✕' }));
    await expect(canvas.getByText('Discard this hotspot?')).toBeVisible();
  },
};

/** Under a finger, ✕ asks before it throws the drawing away. */
export const FingerConfirmDiscard: Story = {
  beforeEach: asFinger,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '✕' }));
    await expect(canvas.getByText('Discard this route?')).toBeVisible();
    await expect(args.draw.cancel).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', { name: 'Discard' }));
    await expect(args.draw.cancel).toHaveBeenCalledOnce();
  },
};

/** Under a finger, a point tapped: its bar replaces the hint. */
export const FingerPointSelected: Story = {
  args: { draw: drawn({ selected: 1 }) },
  beforeEach: asFinger,
};

/** At phone width, under a finger, mid-route. */
export const Phone: Story = {
  parameters: { phone: true },
  beforeEach: asFinger,
};
