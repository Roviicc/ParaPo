import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { TrackingButton, type TrackingVariant } from './tracking-button';

const meta = {
  title: 'Features/Contribute/TrackingButton',
  component: TrackingButton,
  args: { variant: 'start', onClick: fn() },
  decorators: [
    (Story) => (
      <div className="w-[393px] bg-neutral-200">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TrackingButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Figma's green: Tailwind's green-700 and green-800, not a livery. */
export const Start: Story = {};

export const Resume: Story = { args: { variant: 'resume' } };

/** Pressed in, as Figma draws the Stop bar while the recording is running. */
export const StopRecording: Story = { args: { variant: 'stop', isActive: true } };

export const StopAtRest: Story = { args: { variant: 'stop' } };

/** The way button names the way a tap switches TO: orange Pabalik on papunta, blue Papunta on pabalik. */
export const WaySwitchToPabalik: Story = { args: { variant: 'pabalik' } };

export const WaySwitchToPapunta: Story = { args: { variant: 'papunta' } };

export const Save: Story = { args: { variant: 'save' } };

export const Cancel: Story = { args: { variant: 'cancel' } };

const ROW: TrackingVariant[] = ['pabalik', 'save', 'cancel'];

/** The row under the Stop bar: Pabalik and Save share the width, Cancel shrinks to its text. */
export const Row: Story = {
  render: () => (
    <div className="flex flex-col">
      <TrackingButton variant="stop" isActive />
      <div className="flex">
        {ROW.map((variant) => (
          <TrackingButton key={variant} variant={variant} />
        ))}
      </div>
    </div>
  ),
};

/** Disabled keeps its look; nothing here is disabled today, so the story only shows the button stays a real button. */
export const Disabled: Story = { args: { variant: 'save', disabled: true } };
