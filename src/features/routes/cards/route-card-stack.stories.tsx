import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { RouteCardStack } from './route-card-stack';
import type { Direction } from '../model/routes';

/**
 * Sample data only, shaped like the published file: the owner's two routes
 * out of Tala, each line `km` long straight north. Not the real map.
 */
function direction(
  route: string,
  name: string,
  dir: string,
  km: number,
  reversed = false,
): Direction {
  return {
    id: route + (reversed ? '-back' : '-out'),
    route_id: route,
    direction_name: dir,
    origin_terminal: null,
    destination_terminal: null,
    shape: {
      type: 'LineString',
      coordinates: [
        [121.04, 14.7],
        [121.04, 14.7 + km / 111.2],
      ],
    },
    reversed,
    confidence: 'drawn',
    route: {
      id: route,
      signboard: null,
      long_name: null,
      mode: 'jeepney',
      fare_note: null,
      head_stop_id: 'tala',
      tail_stop_id: route + '-tail',
      via: null,
      name,
    },
  };
}
const tala: Direction[] = [
  direction('nova', 'Tala – Novaliches', 'Tala → Novaliches', 12.4),
  direction('nova', 'Tala – Novaliches', 'Novaliches → Tala', 13.1, true),
  direction('sm', 'Tala – SM Fairview', 'Tala → SM Fairview', 9.4),
  direction('sm', 'Tala – SM Fairview', 'SM Fairview → Tala', 11.2, true),
];

type Frame = 'list' | 'hotspot';
/** The list's 384 in the top-left corner, and a hotspot card's 320 (BottomSheet's `floats="card"`, `@wide:w-80`). */
const FRAME = { list: 'w-96', hotspot: 'w-80' } satisfies Record<Frame, string>;
const frameOf = (p: { frame?: Frame }) => FRAME[p.frame ?? 'list'];

/** Keeps the Selected card as the apps do, so a story can be tapped through. */
function Picking(props: ComponentProps<typeof RouteCardStack>) {
  const [selected, setSelected] = useState(props.selected);
  return (
    <RouteCardStack
      {...props}
      selected={selected}
      onSelect={(p) => {
        props.onSelect(p);
        setSelected(p?.from ?? null);
      }}
    />
  );
}

const meta = {
  title: 'Features/Routes/RouteCardStack',
  component: RouteCardStack,
  render: (args) => <Picking {...args} />,
  decorators: [
    (Story, ctx) => (
      <div className={frameOf(ctx.parameters)}>
        <Story />
      </div>
    ),
  ],
  args: {
    routes: tala,
    back: false,
    selected: null,
    onSelect: fn(),
    onRoute: fn(),
    testId: 'card',
  },
} satisfies Meta<typeof RouteCardStack>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The way there: one place, Tala, with its two ways out — one card. The colours are drawn at random. */
export const OnePlace: Story = {};

/** The way back: a card per place, Novaliches and SM Fairview, never alike side by side. */
export const TwoPlaces: Story = { args: { back: true } };

/** As narrow as a hotspot's card on a wide screen, 320: the cards fill it edge to edge. */
export const InAHotspotCard: Story = { parameters: { frame: 'hotspot' } };

/** The way back with SM Fairview's card Selected: pressed in, the other at rest. */
export const OneSelected: Story = { args: { back: true, selected: 'SM Fairview' } };

/**
 * Tapped through: a row opens its trip straight away and picks no card (the
 * owner, 2026-09-29: selecting it too was confusing); a tap on Tala's card
 * selects it, handing the map its two directions, and a second lets it go.
 */
export const ARowOpens: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('SM Fairview'));
    await expect(args.onRoute).toHaveBeenCalledTimes(1);
    await expect(args.onSelect).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', { name: 'Tala', pressed: false }));
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ from: 'Tala' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Tala', pressed: true }));
    await expect(args.onSelect).toHaveBeenLastCalledWith(null);
  },
};
