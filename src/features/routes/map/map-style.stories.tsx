import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { BASEMAPS, type Basemap } from './basemap';
import { BASEMAP_THUMBNAILS } from './basemap-thumbnails';
import { MapStyle } from './map-style';

const meta = {
  title: 'Features/Routes/MapStyle',
  component: MapStyle,
  // Over a map-coloured box, as it floats over the map.
  decorators: [
    (Story) => (
      <div className="inline-block bg-surface-quaternary p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    basemaps: BASEMAPS,
    selectedId: 'positron',
    thumbnails: BASEMAP_THUMBNAILS,
    onSelect: fn(),
    onClose: fn(),
    onClosed: fn(),
  },
} satisfies Meta<typeof MapStyle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The public map's three, Monochrome shown: the owner's frame (4179:10790). */
export const Default: Story = {};

/** Colour shown. */
export const ColourSelected: Story = { args: { selectedId: 'liberty' } };

/** Fiord shown. */
export const FiordSelected: Story = { args: { selectedId: 'fiord' } };

// The studio's two, as the stories may not reach into features/studio:
// pictureless, which is the tile a design without a picture shows.
const STUDIO_LIKE: readonly Basemap[] = [
  ...BASEMAPS,
  { ...BASEMAPS[1], id: 'terrain', label: 'Terrain' },
  { ...BASEMAPS[0], id: 'satellite', label: 'Satellite' },
];

/** The studio's five, three a row (the owner, 2026-10-16); here Terrain and Satellite without pictures. */
export const FiveWrap: Story = { args: { basemaps: STUDIO_LIKE, selectedId: 'terrain' } };

/** No picture for any design: plain tiles, the names still read. */
export const NoPictures: Story = { args: { thumbnails: {} } };

/** On a phone, 390 wide: the card fits with the map's 16 px each side to spare. */
export const Phone: Story = {
  decorators: [
    (Story) => (
      <div className="@container w-[390px] bg-surface-quaternary px-4 py-6">
        <Story />
      </div>
    ),
  ],
};
