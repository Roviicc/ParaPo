import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { Button } from './button';

/** The set's default icon is a navigation arrow; any square SVG in currentColor works. */
const NavIcon = (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path d="M17.8 2.2a.75.75 0 0 1 .17.8l-5.6 14.4a.75.75 0 0 1-1.4-.03l-2.03-5.55-5.55-2.03a.75.75 0 0 1-.03-1.4L17 2.03a.75.75 0 0 1 .8.17Z" />
  </svg>
);

const meta = {
  title: 'DesignSystem/Primitives/Button',
  component: Button,
  args: {
    variant: 'special',
    label: 'Button',
    firstIcon: NavIcon,
    lastIcon: NavIcon,
    onClick: fn(),
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The jeepney pill: Cubao Free on the quiet surface, lit from above with a
 * hairline edge. Hover deepens the glow; press sinks it. The three shadows
 * sit side by side on Foundation/Tokens.
 */
export const Special: Story = {};

/** Brand blue, SN Pro Medium, bevelled. Hover lights it from the top; press darkens and sinks it. */
export const Primary: Story = { args: { variant: 'primary' } };

/** The destructive red, on Primary's shadows. Press darkens to Error/surface-secondary. */
export const Error: Story = { args: { variant: 'error' } };

/** Small exists only for Special — on the other variants it is a compile error. */
export const SpecialSmall: Story = { args: { variant: 'special', size: 'small' } };

/** The set's opacity/60, communicated to the browser too, not just greyed. */
export const Disabled: Story = {
  render: () => (
    <div className="flex gap-3">
      <Button variant="special" label="Button" firstIcon={NavIcon} lastIcon={NavIcon} disabled />
      <Button variant="primary" label="Button" firstIcon={NavIcon} lastIcon={NavIcon} disabled />
      <Button variant="error" label="Button" firstIcon={NavIcon} lastIcon={NavIcon} disabled />
    </div>
  ),
};

/** Both icon slots are optional; the label alone is a complete button. */
export const LabelOnly: Story = {
  args: { variant: 'special', firstIcon: undefined, lastIcon: undefined },
};

/** One of each, side by side, as the set's sheet shows them. */
export const AllVariants: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button variant="special" label="Button" firstIcon={NavIcon} lastIcon={NavIcon} />
      <Button variant="primary" label="Button" firstIcon={NavIcon} lastIcon={NavIcon} />
      <Button variant="error" label="Button" firstIcon={NavIcon} lastIcon={NavIcon} />
    </div>
  ),
};

/**
 * A real specimen: the card-actions row the Button will one day replace,
 * at phone width over a map-coloured box, the way CardActions lays out
 * Edit, Extend and Delete today.
 */
export const CardActionsSpecimen: Story = {
  render: () => (
    <div className="@container relative h-56 w-[390px] overflow-hidden bg-neutral-200">
      <div className="absolute inset-x-3 bottom-3 rounded-xl bg-surface p-4 shadow-xl">
        <p className="mb-3 font-sn-pro text-sm text-content-tertiary">Tala → SM Fairview</p>
        <div className="flex gap-2">
          <Button variant="primary" label="Edit route" />
          <Button variant="special" label="Extend" />
          <Button variant="error" label="Delete" />
        </div>
      </div>
    </div>
  ),
};
