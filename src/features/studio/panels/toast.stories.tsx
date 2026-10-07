import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Toast } from './toast';

const meta = {
  title: 'Features/Studio/Toast',
  component: Toast,
  decorators: [
    (Story) => (
      <div className="relative h-40 w-[28rem] bg-neutral-200">
        <Story />
      </div>
    ),
  ],
  args: { onDismiss: fn() },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What a save did: a hotspot saved. */
export const Plain: Story = {
  args: {
    children: (
      <>
        Saved hintuan <strong>Tala</strong>
      </>
    ),
  },
};

/** A direction saved, its route with a slot left: the return trip offered. */
export const PlainWithAction: Story = {
  args: {
    children: (
      <>
        Saved <strong>Tala – Novaliches</strong> · Tala → Novaliches
      </>
    ),
    action: (
      <button
        type="button"
        className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-900"
      >
        Draw the return trip
      </button>
    ),
  },
};

/** What went wrong: red, and announced as a problem. */
export const Alert: Story = {
  args: { tone: 'alert', children: 'Could not load the saved routes.' },
};
