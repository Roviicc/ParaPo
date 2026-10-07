import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MapControlButton } from './map-control-button';

/** The compass needle "Where am I" wears; any 16 px icon sits the same. */
const needle = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinejoin="round"
  >
    <path d="M14 2 2 7l6 1 1 6z" />
  </svg>
);

const meta = {
  title: 'Features/Routes/MapControlButton',
  component: MapControlButton,
  decorators: [
    (Story) => (
      <div className="bg-neutral-200 p-4">
        <Story />
      </div>
    ),
  ],
  args: { 'aria-label': 'Where am I', title: 'Where am I', onClick: fn(), children: needle },
} satisfies Meta<typeof MapControlButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** At rest: Map design always, "Where am I" until asked. */
export const Plain: Story = { args: { look: 'plain' } };

/** On: "Where am I" showing the visitor, not following. */
export const On: Story = { args: { look: 'on' } };

/** Filled: "Where am I" following the visitor. */
export const Filled: Story = { args: { look: 'filled' } };
