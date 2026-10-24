import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { ProfileScreen } from './profile-screen';

const meta = {
  title: 'Features/Contribute/ProfileScreen',
  component: ProfileScreen,
  parameters: { layout: 'fullscreen' },
  args: {
    email: 'juan@example.com',
    profile: { name: 'Juan dela Cruz', phone: '+639171234567' },
    loadError: null,
    isSaving: false,
    error: null,
    isSigningOut: false,
    onRetry: fn(),
    onSave: fn(),
    onSignOut: fn(),
    onBack: fn(),
  },
  decorators: [
    (Story) => (
      <div className="relative h-[844px] w-97.5 overflow-hidden">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Save waits until the name or number changes. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1, name: 'Profile' })).toHaveFocus();
    await expect(canvas.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.type(canvas.getByLabelText('Name'), ' Jr.');
    await expect(canvas.getByRole('button', { name: 'Save' })).toBeEnabled();
  },
};

export const Loading: Story = { args: { profile: null } };

export const LoadFailed: Story = {
  args: { profile: null, loadError: "No signal — try again when you're online" },
};

export const Saving: Story = { args: { isSaving: true } };

export const NotSaved: Story = {
  args: { error: "No signal — try again when you're online" },
};

export const SigningOut: Story = { args: { isSigningOut: true } };

export const LongName: Story = {
  args: {
    email: 'juan.dela.cruz.the.third.of.quezon.city@example-long-domain.com',
    profile: {
      name: 'Juan Protacio Emmanuel dela Cruz y Santos de la Rosa del Rosario',
      phone: '+639171234567',
    },
  },
};
