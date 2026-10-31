import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { SaveForm } from './save-form';

const meta = {
  title: 'Features/Contribute/SaveForm',
  component: SaveForm,
  args: {
    figures: { elapsedSeconds: 42 * 60, distanceM: 4210 },
    failedFixWrites: 0,
    onKeepRecording: fn(),
    onSave: fn(),
    onDiscard: fn(),
  },
  decorators: [
    (Story) => (
      <div className="relative h-[852px] w-[393px] overflow-hidden bg-surface-quaternary">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SaveForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Figma's Save Recording (4521:3679), as it opens: every field empty, the two minutes running. */
export const Empty: Story = {};

/** Every field filled; Save recording saves what was said, the fare in pesos. */
export const Filled: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Start point name'), 'SM Fairview');
    await userEvent.type(canvas.getByLabelText('End point name'), 'Cubao');
    await userEvent.type(canvas.getByLabelText('Fare'), '13.50');
    await userEvent.click(canvas.getByRole('button', { name: 'What did you ride?' }));
    await userEvent.click(within(document.body).getByRole('radio', { name: 'Jeep' }));
    await userEvent.type(canvas.getByLabelText('Description'), 'Fairview–Cubao via Commonwealth');
    await userEvent.click(canvas.getByRole('button', { name: 'Save recording' }));
    await expect(args.onSave).toHaveBeenCalledWith({
      startPointName: 'SM Fairview',
      endPointName: 'Cubao',
      description: 'Fairview–Cubao via Commonwealth',
      rideKind: 'Jeep',
      farePhp: 13.5,
    });
  },
};

/** A fare out of range: the field in error, what it takes under it, and nothing saved. */
export const FareError: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Fare'), '2500');
    await userEvent.click(canvas.getByRole('button', { name: 'Save recording' }));
    await expect(canvas.getByText('Enter an amount from ₱0 to ₱2,000')).toBeInTheDocument();
    await expect(canvas.getByLabelText('Fare')).toHaveFocus();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** "What did you ride?" open (4525:15313): seven rides, Others last with no icon, the form dimmed. */
export const SheetOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'What did you ride?' }));
    const sheet = within(document.body).getByRole('dialog', { name: 'What did you ride?' });
    await expect(within(sheet).getAllByRole('radio')).toHaveLength(7);
  },
};

/** The phone could not keep part of the recording: one line at the top, in the error style. */
export const PointsWarning: Story = {
  args: { failedFixWrites: 5 },
};

/** Discard recording asks first, on the Stopping screen: Keep it is back to the form. */
export const DiscardAsked: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Discard recording' }));
    const question = within(document.body).getByRole('alertdialog');
    await expect(within(question).getByRole('button', { name: 'Keep it' })).toBeInTheDocument();
    await expect(args.onDiscard).not.toHaveBeenCalled();
  },
};
