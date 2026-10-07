import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import type { Direction } from '@/features/routes/model/routes';

import { SignboardEditor, type SignboardCalls } from './signboard-editor';

/** Sample boards, not real ones: a dark board, a lime word over a gold one. */
const svg = (top: string, under: string) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="98" height="40" viewBox="0 0 98 40"><rect width="98" height="40" fill="#111"/>` +
      `<text x="49" y="21" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="16" fill="#7CFC00">${top}</text>` +
      `<text x="49" y="34" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="9" fill="#FFB400">${under}</text></svg>`,
  );
const pictures: Record<string, string> = {
  'a.svg': svg('BAYAN', 'SIMBAHAN'),
  'b.svg': svg('SM', 'FAIRVIEW'),
};

const direction = (signboards: string[], reversed = false) =>
  ({
    id: 'v1',
    routeId: 'r1',
    name: null,
    originTerminal: null,
    destinationTerminal: null,
    shape: null,
    reversed,
    confidence: 'drawn',
    route: { id: 'r1' },
    signboards,
  }) as unknown as Direction;

/** The bucket and the row, in memory: each call answers as the live one does, after a moment. */
const standIn = (): SignboardCalls => ({
  signboardUrl: (n) => pictures[n] ?? svg('NEW', n.slice(0, 6)),
  addSignboard: fn(async (_id, now, file: File) => {
    await new Promise((r) => setTimeout(r, 300));
    return [...now, file.name];
  }),
  removeSignboard: fn(async (_id, now, name) => now.filter((n: string) => n !== name)),
  moveSignboardEarlier: fn(async (_id, now, name) => {
    const i = now.indexOf(name);
    const next = [...now];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    return next;
  }),
});

const meta = {
  title: 'Features/Studio/SignboardEditor',
  component: SignboardEditor,
  parameters: { layout: 'padded' },
  args: { direction: direction(['a.svg', 'b.svg']), onChanged: fn() },
  decorators: [(Story) => <div className="w-[369px] bg-surface pt-4">{Story()}</div>],
} satisfies Meta<typeof SignboardEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No board yet for this way: says so, and offers Add SVG. */
export const Empty: Story = {
  args: { direction: direction([]), calls: standIn() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No signboard yet for this way.')).toBeVisible();
  },
};

/** Two boards, Papunta: the first has no ‹, the second does. */
export const TwoBoards: Story = {
  args: { calls: standIn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByTestId('signboard-item')).toHaveLength(2);
    await expect(canvas.queryByRole('button', { name: 'Move signboard 1 earlier' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Move signboard 2 earlier' }));
    await waitFor(() => expect(args.onChanged).toHaveBeenCalled());
  },
};

/** The way back's: the heading names it. */
export const Pabalik: Story = {
  args: { direction: direction(['b.svg'], true), calls: standIn() },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', { name: 'Signboard · Pabalik' }),
    ).toBeVisible();
  },
};

/** While a file goes up: every button rests, and Add SVG says Saving…. */
export const Saving: Story = {
  args: { calls: { ...standIn(), addSignboard: () => new Promise<string[]>(() => {}) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(
      canvas.getByTestId('signboard-file'),
      new File(['<svg/>'], 'c.svg', { type: 'image/svg+xml' }),
    );
    await expect(await canvas.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Remove signboard 1' })).toBeDisabled();
  },
};

/** A refusal, in the words the cleaning or the bucket gave. */
export const Refused: Story = {
  args: {
    calls: {
      ...standIn(),
      addSignboard: async (_id, _now, file: File) => {
        throw new Error(`${file.name}: Not an SVG file: there is text outside the drawing.`);
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(
      canvas.getByTestId('signboard-file'),
      new File(['hello'], 'note.svg', { type: 'image/svg+xml' }),
    );
    await expect(await canvas.findByRole('alert')).toHaveTextContent('note.svg: Not an SVG file');
  },
};
