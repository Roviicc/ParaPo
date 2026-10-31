import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { StartBar } from './start-bar';

const meta = {
  title: 'Features/Contribute/StartBar',
  component: StartBar,
  args: { onClick: fn() },
  decorators: [
    (Story) => (
      // A phone's width, over a stand-in for the map.
      <div className="flex h-60 w-[393px] flex-col justify-end bg-surface-quaternary pb-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StartBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Start tracking on Record (4520:3489): the frame's width less 32 each side, 48 tall. */
export const Default: Story = {};
