import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatsStrip } from './stats-strip';

const meta = {
  title: 'Features/Contribute/StatsStrip',
  component: StatsStrip,
  args: { elapsedSeconds: 42 * 60, distanceM: 4200, way: 'outbound', isPaused: false },
  decorators: [
    (Story) => (
      <div className="relative h-40 w-[393px] overflow-hidden bg-neutral-300">
        <div className="absolute inset-x-0 top-6 h-1.5 bg-map-trail-papunta" />
        <div className="absolute inset-x-0 bottom-0">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof StatsStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Papunta: Story = {};

export const Pabalik: Story = {
  args: { way: 'return', elapsedSeconds: 61 * 60, distanceM: 8800 },
};

/** After Stop: the third column says Stopped. */
export const Stopped: Story = { args: { isPaused: true } };

/** A new recording, before the first fix. */
export const JustStarted: Story = { args: { elapsedSeconds: 0, distanceM: 0 } };
