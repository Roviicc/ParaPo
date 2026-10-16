import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

/*
 * Changing every colour a style draws by one rule: Colour's muting
 * (daylight.ts) and Monochrome's cool gray (monochrome.ts). A rule takes each
 * colour as hue, saturation and lightness and gives back its replacement, so
 * the colours drawn stay the style's own (or map-colours.ts's), moved, and no
 * colour is written here.
 */

export interface Hsla {
  /** 0 to 360. */
  hue: number;
  /** 0 to 100. */
  saturation: number;
  /** 0 to 100. */
  lightness: number;
  /** 0 to 1. */
  alpha: number;
}

/** A colour's replacement; `isName` for a label's text, which most rules keep as dark as it was. */
export type Recolour = (colour: Hsla, isName: boolean) => Hsla;

const numbers = (list: string): number[] =>
  list
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map((n) => Number.parseFloat(n));

function fromRgb(red: number, green: number, blue: number, alpha: number): Hsla {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const chroma = max - min;
  if (chroma === 0) return { hue: 0, saturation: 0, lightness: lightness * 100, alpha };
  const saturation = chroma / (1 - Math.abs(2 * lightness - 1));
  const sector =
    max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  return {
    hue: (sector * 60 + 360) % 360,
    saturation: saturation * 100,
    lightness: lightness * 100,
    alpha,
  };
}

/** A CSS colour as the styles write them — #hex, rgb(a) or hsl(a) — or null for any other string. */
function parseColour(text: string): Hsla | null {
  const colour = text.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(colour)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const [r, g, b, a = 255] = (full.match(/../g) ?? []).map((h) => Number.parseInt(h, 16));
    return fromRgb(r, g, b, a / 255);
  }
  const rgb = /^rgba?\((.*)\)$/.exec(colour)?.[1];
  if (rgb) {
    const [r, g, b, a = 1] = numbers(rgb);
    return fromRgb(r, g, b, a);
  }
  const hsl = /^hsla?\((.*)\)$/.exec(colour)?.[1];
  if (hsl) {
    const [hue, saturation, lightness, alpha = 1] = numbers(hsl.replaceAll('%', ''));
    return { hue, saturation, lightness, alpha };
  }
  return null;
}

const asCss = (c: Hsla): string =>
  `hsla(${c.hue.toFixed(1)}, ${c.saturation.toFixed(1)}%, ${c.lightness.toFixed(1)}%, ${c.alpha})`;

/**
 * A paint value with every colour in it replaced: a plain colour, or the
 * colours inside an expression (a zoom ramp, a match). JSON's reviver visits
 * every string, and the words of an expression are not colours, so they stay.
 */
function recolouredValue<T>(value: T, recolour: Recolour, isName: boolean): T {
  return JSON.parse(JSON.stringify(value), (_key, v: unknown) => {
    const colour = typeof v === 'string' ? parseColour(v) : null;
    return colour ? asCss(recolour(colour, isName)) : v;
  });
}

const isColour = (property: string): boolean => property.endsWith('-color');

/** A layer with every colour of its paint replaced. Pure. */
export function recolouredLayer(l: LayerSpecification, recolour: Recolour): LayerSpecification {
  if (!('paint' in l) || !l.paint) return l;
  const paint = Object.fromEntries(
    Object.entries(l.paint).map(([property, value]: [string, unknown]) => [
      property,
      isColour(property) ? recolouredValue(value, recolour, property === 'text-color') : value,
    ]),
  );
  return { ...l, paint };
}

/** A style with every colour it draws replaced. Pure: the input is left alone. */
export function recolouredStyle(style: StyleSpecification, recolour: Recolour): StyleSpecification {
  return { ...style, layers: style.layers.map((l) => recolouredLayer(l, recolour)) };
}
