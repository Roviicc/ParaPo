import { manilaDate, pesoRange } from './fares';
import { isRailLine, type RailLine } from './routes';

/**
 * The train fares, station to station: LRT-1, LRT-2 and MRT-3 — the owner's
 * ask of 2026-10-02, "real train fares, shown by station like jeep fares".
 * From the operators' own tables, transcribed and checked cell by cell;
 * the research and its sources are in docs/research/rail-fares.md.
 *
 * A ride's fare is two: the beep card's (stored value) and the single
 * journey ticket's, which is the same or more. The card shows them as a
 * range, card to ticket, in whole pesos as every fare on the cards is
 * (pesoRange): a ₱16.50 card fare reads ₱16. Amounts in centavos.
 *
 * Discounted is students', seniors' and PWDs': half, on every line, since
 * 2025-07-16 (students' since 2025-06-20). Since 2026-03-23 LRT-2 and MRT-3
 * charge everyone half "until further notice", and the two halves do not
 * stack: a discounted rider pays the same as anyone.
 */

/** One ride's two fares, in centavos. */
export interface RailFare {
  card: number;
  ticket: number;
}

/** A station as the map names it (its hotspot name), then the operator's own names for it. */
type Station = readonly [label: string, ...aliases: string[]];

/** LRT-1, Dr. Santos to Fernando Poe Jr., in the order of LRMC's matrix. */
const LRT1_STATIONS: readonly Station[] = [
  ['Dr. Santos'],
  ['Ninoy Aquino Avenue'],
  ['PITX'],
  ['MIA Road'],
  ['Redemptorist-Aseana'],
  ['Baclaran'],
  ['EDSA'],
  ['Libertad'],
  ['Gil Puyat'],
  ['Vito Cruz'],
  ['Quirino'],
  ['Pedro Gil'],
  ['United Nations', 'UN Avenue'],
  ['Central Terminal', 'Central'],
  ['Carriedo'],
  ['Doroteo Jose', 'D. Jose'],
  ['Bambang'],
  ['Tayuman'],
  ['Blumentritt'],
  ['Abad Santos'],
  ['R. Papa'],
  ['5th Avenue'],
  ['Monumento', 'Yamaha Monumento'],
  ['Balintawak'],
  ['Fernando Poe Jr.', 'Roosevelt'],
];

/**
 * LRMC's stored value matrix, effective 2025-04-02, in whole pesos
 * (lrmc.ph, "New SVC fare matrix"). The ticket is the card's fare rounded
 * up to the next ₱5, never under ₱20: LRMC's single journey matrix, every
 * cell (rail-fares-test).
 */
const LRT1_CARD: readonly (readonly number[])[] = [
  [
    16, 19, 20, 22, 23, 26, 27, 28, 29, 31, 32, 33, 34, 36, 37, 38, 39, 40, 41, 42, 43, 45, 46, 49,
    52,
  ],
  [
    19, 16, 18, 20, 21, 23, 24, 26, 27, 28, 29, 31, 32, 33, 35, 36, 36, 37, 38, 40, 41, 42, 44, 47,
    50,
  ],
  [
    20, 18, 16, 18, 19, 22, 22, 24, 25, 27, 28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 39, 40, 42, 45,
    48,
  ],
  [
    22, 20, 18, 16, 17, 20, 20, 22, 23, 25, 26, 27, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38, 40, 43,
    46,
  ],
  [
    23, 21, 19, 17, 16, 18, 19, 21, 22, 23, 25, 26, 27, 29, 30, 31, 32, 33, 34, 35, 36, 37, 39, 42,
    45,
  ],
  [
    26, 23, 22, 20, 18, 16, 17, 19, 20, 21, 22, 24, 25, 27, 28, 29, 30, 30, 31, 33, 34, 35, 37, 40,
    43,
  ],
  [
    27, 24, 22, 20, 19, 17, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 39,
    42,
  ],
  [
    28, 26, 24, 22, 21, 19, 18, 16, 17, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 30, 31, 33, 34, 38,
    40,
  ],
  [
    29, 27, 25, 23, 22, 20, 19, 17, 16, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 37,
    39,
  ],
  [
    31, 28, 27, 25, 23, 21, 20, 19, 18, 16, 17, 19, 20, 22, 23, 24, 25, 25, 26, 28, 29, 30, 32, 35,
    38,
  ],
  [
    32, 29, 28, 26, 25, 22, 22, 20, 19, 17, 16, 17, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 31, 34,
    37,
  ],
  [
    33, 31, 29, 27, 26, 24, 23, 21, 20, 19, 17, 16, 17, 19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 33,
    35,
  ],
  [
    34, 32, 30, 28, 27, 25, 24, 22, 21, 20, 19, 17, 16, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 32,
    34,
  ],
  [
    36, 33, 32, 30, 29, 27, 26, 24, 23, 22, 20, 19, 18, 16, 17, 18, 19, 20, 21, 23, 23, 25, 27, 30,
    33,
  ],
  [
    37, 35, 33, 31, 30, 28, 27, 25, 24, 23, 21, 20, 19, 17, 16, 17, 18, 19, 20, 21, 22, 24, 25, 29,
    31,
  ],
  [
    38, 36, 34, 32, 31, 29, 28, 26, 25, 24, 22, 21, 20, 18, 17, 16, 17, 18, 19, 20, 21, 23, 24, 28,
    30,
  ],
  [
    39, 36, 35, 33, 32, 30, 29, 27, 26, 25, 23, 22, 21, 19, 18, 17, 16, 17, 18, 20, 20, 22, 23, 27,
    30,
  ],
  [
    40, 37, 36, 34, 33, 30, 30, 28, 27, 25, 24, 23, 22, 20, 19, 18, 17, 16, 17, 19, 20, 21, 23, 26,
    29,
  ],
  [
    41, 38, 37, 35, 34, 31, 31, 29, 28, 26, 25, 24, 23, 21, 20, 19, 18, 17, 16, 18, 19, 20, 22, 25,
    28,
  ],
  [
    42, 40, 38, 36, 35, 33, 32, 30, 29, 28, 27, 25, 24, 23, 21, 20, 20, 19, 18, 16, 17, 19, 20, 24,
    26,
  ],
  [
    43, 41, 39, 37, 36, 34, 33, 31, 30, 29, 28, 26, 25, 23, 22, 21, 20, 20, 19, 17, 16, 18, 19, 23,
    25,
  ],
  [
    45, 42, 40, 38, 37, 35, 34, 33, 32, 30, 29, 28, 27, 25, 24, 23, 22, 21, 20, 19, 18, 16, 18, 21,
    24,
  ],
  [
    46, 44, 42, 40, 39, 37, 36, 34, 33, 32, 31, 29, 28, 27, 25, 24, 23, 23, 22, 20, 19, 18, 16, 20,
    22,
  ],
  [
    49, 47, 45, 43, 42, 40, 39, 38, 37, 35, 34, 33, 32, 30, 29, 28, 27, 26, 25, 24, 23, 21, 20, 16,
    19,
  ],
  [
    52, 50, 48, 46, 45, 43, 42, 40, 39, 38, 37, 35, 34, 33, 31, 30, 30, 29, 28, 26, 25, 24, 22, 19,
    16,
  ],
];

/** LRT-2, Recto to Antipolo, in the order of LRTA's matrix. */
const LRT2_STATIONS: readonly Station[] = [
  ['Recto'],
  ['Legarda'],
  ['Pureza'],
  ['V. Mapa'],
  ['J. Ruiz'],
  ['Gilmore'],
  ['Betty Go - Belmonte', 'Betty Go-Belmonte'],
  ['Cubao', 'Araneta Center - Cubao', 'Araneta Center-Cubao'],
  ['Anonas'],
  ['Katipunan'],
  ['Santolan'],
  ['Marikina-Pasig'],
  ['Antipolo'],
];

/**
 * LRTA's stored value matrix, effective 2023-08-02, in whole pesos
 * (lrta.gov.ph, Fare Matrix Line 2). The ticket is the card's fare rounded
 * up to the next ₱5, as LRTA's single journey matrix has it, every cell.
 */
const LRT2_CARD: readonly (readonly number[])[] = [
  [13, 15, 16, 18, 19, 21, 22, 23, 25, 26, 28, 31, 33],
  [15, 13, 15, 17, 18, 19, 21, 22, 24, 25, 27, 29, 32],
  [16, 15, 13, 15, 16, 18, 19, 20, 22, 23, 26, 28, 30],
  [18, 17, 15, 13, 15, 16, 17, 19, 20, 22, 24, 26, 29],
  [19, 18, 16, 15, 13, 14, 16, 17, 19, 20, 22, 24, 27],
  [21, 19, 18, 16, 14, 13, 15, 16, 18, 19, 21, 23, 26],
  [22, 21, 19, 17, 16, 15, 13, 15, 16, 18, 20, 22, 25],
  [23, 22, 20, 19, 17, 16, 15, 13, 15, 16, 19, 21, 23],
  [25, 24, 22, 20, 19, 18, 16, 15, 13, 14, 17, 19, 22],
  [26, 25, 23, 22, 20, 19, 18, 16, 14, 13, 16, 18, 21],
  [28, 27, 26, 24, 22, 21, 20, 19, 17, 16, 13, 15, 18],
  [31, 29, 28, 26, 24, 23, 22, 21, 19, 18, 15, 13, 16],
  [33, 32, 30, 29, 27, 26, 25, 23, 22, 21, 18, 16, 13],
];

/** MRT-3, North Avenue to Taft Avenue. */
const MRT3_STATIONS: readonly Station[] = [
  ['North Avenue'],
  ['Quezon Avenue'],
  ['Kamuning', 'GMA Kamuning', 'GMA-Kamuning'],
  ['Cubao', 'Araneta Center-Cubao'],
  ['Santolan-Annapolis'],
  ['Ortigas'],
  ['Shaw Boulevard'],
  ['Boni'],
  ['Guadalupe'],
  ['Buendia'],
  ['Ayala'],
  ['Magallanes'],
  ['Taft Avenue'],
];

/**
 * MRT-3's fare by stations travelled, since 2015-01-04 (mrt3.com's fare
 * guide): 1–2 ₱13, 3–4 ₱16, 5–7 ₱20, 8–10 ₱24, 11–12 ₱28. Card and ticket
 * the same.
 */
function mrt3Pesos(hops: number): number {
  return hops <= 2 ? 13 : hops <= 4 ? 16 : hops <= 7 ? 20 : hops <= 10 ? 24 : 28;
}

/** The day the half fare for everyone began on LRT-2 and MRT-3: DOTr, "until further notice". */
export const HALF_FARE_FROM = '2026-03-23';
/** The day the half fare for students, seniors and PWDs covered all three: seniors' and PWDs' start. */
export const DISCOUNT_FROM = '2025-07-16';

const STATIONS: Record<RailLine, readonly Station[]> = {
  'LRT-1': LRT1_STATIONS,
  'LRT-2': LRT2_STATIONS,
  'MRT-3': MRT3_STATIONS,
};

/** Case, spaces and punctuation aside: "Betty Go - Belmonte" is "Betty Go-Belmonte". */
const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Where a station sits in its line's table, by any of its names; -1 when the table has no such station. */
export function stationIndex(line: RailLine, name: string): number {
  const k = key(name);
  return STATIONS[line].findIndex((names) => names.some((n) => key(n) === k));
}

const up5 = (pesos: number) => Math.ceil(pesos / 5) * 5;

/**
 * The fare between two stations on `date` (YYYY-MM-DD, Manila), regular or
 * discounted, in centavos; undefined for a station the table does not know, the same
 * station twice, or a date before the fare it would need.
 */
export function railFare(
  line: RailLine,
  from: string,
  to: string,
  date: string,
  kind: 'regular' | 'discounted' = 'regular',
): RailFare | undefined {
  const [i, j] = [stationIndex(line, from), stationIndex(line, to)];
  if (i < 0 || j < 0 || i === j) return undefined;
  if (kind === 'discounted' && date < DISCOUNT_FROM) return undefined;
  // The full fare, in pesos, card then ticket.
  let card: number;
  let ticket: number;
  if (line === 'LRT-1') {
    if (date < '2025-04-02') return undefined;
    card = LRT1_CARD[i][j];
    ticket = Math.max(20, up5(card));
  } else if (line === 'LRT-2') {
    if (date < '2023-08-02') return undefined;
    card = LRT2_CARD[i][j];
    ticket = up5(card);
  } else {
    card = ticket = mrt3Pesos(Math.abs(i - j));
  }
  // Half: the card's to the centavo, the ticket's up to a whole peso; MRT-3's
  // halves are whole pesos, down (DOTr's half-fare matrix).
  const half = (c: number, t: number): RailFare =>
    line === 'MRT-3'
      ? { card: Math.floor(c / 2) * 100, ticket: Math.floor(t / 2) * 100 }
      : { card: c * 50, ticket: Math.ceil(t / 2) * 100 };
  const everyoneHalf = line !== 'LRT-1' && date >= HALF_FARE_FROM;
  if (everyoneHalf || kind === 'discounted') return half(card, ticket);
  return { card: card * 100, ticket: ticket * 100 };
}

/** A ride as the cards write it: `₱17–20`, card to ticket, in whole pesos; `₱13` when they agree. */
export function railFareText(fare: RailFare): string {
  return pesoRange(fare.card, fare.ticket);
}

/**
 * A train ride's pesos for the fare tile, regular and discounted, between two
 * stations as the timeline names them; undefined for a route of no train
 * line, a missing end, or a station the table does not know.
 */
export function railFares(
  line: string | null | undefined,
  from: string | undefined,
  to: string | undefined,
  date = manilaDate(),
): { regular: string; discounted: string } | undefined {
  if (!isRailLine(line) || !from || !to) return undefined;
  const regular = railFare(line, from, to, date);
  const discounted = railFare(line, from, to, date, 'discounted');
  return regular && discounted
    ? { regular: railFareText(regular), discounted: railFareText(discounted) }
    : undefined;
}
