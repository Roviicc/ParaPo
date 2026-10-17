/** Metres as kilometres to two decimals: `1.25`. */
export const kmText = (metres: number): string => (metres / 1000).toFixed(2);

/** Seconds as minutes to one decimal: `3.5`. */
export const minutesText = (seconds: number): string => (seconds / 60).toFixed(1);

/** The time of day of an instant, in the phone's own clock. */
export const clockText = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** The day and time of an instant, in the phone's own clock. */
export const dayText = (ms: number): string =>
  new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
