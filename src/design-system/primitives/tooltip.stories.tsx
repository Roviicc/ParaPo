import type { Meta, StoryObj } from '@storybook/react-vite';

import { Tooltip } from './tooltip';

const meta = {
  title: 'DesignSystem/Primitives/Tooltip',
  component: Tooltip,
  args: { label: 'Where am I' },
  // Room on every side for the arrow.
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Arrow down: the bubble sits above its control. */
export const Bottom: Story = {};

/** Arrow up: the bubble sits below its control. */
export const Top: Story = { args: { position: 'top' } };

/** Arrow left: the bubble sits to the control's right. */
export const Left: Story = { args: { position: 'left' } };

/** Arrow right: the bubble sits to the control's left. */
export const Right: Story = { args: { position: 'right' } };

/** A longer label stays on one line, as the set draws it. */
export const LongLabel: Story = { args: { label: 'Switch to the satellite map' } };

/**
 * A real specimen at phone width: over a round control on the map, the way
 * it will show beside "Where am I". Placed by hand here; the control that
 * owns it does that in the app.
 */
export const MapSpecimen: Story = {
  render: () => (
    <div className="@container relative h-56 w-[390px] overflow-hidden bg-neutral-200">
      <div className="absolute right-3 bottom-3 flex flex-col items-center gap-2">
        <Tooltip label="Where am I" />
        <span className="size-10 rounded-full bg-surface-tertiary shadow-special-button-rest" />
      </div>
    </div>
  ),
};
