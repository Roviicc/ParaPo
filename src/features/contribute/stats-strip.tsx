import { cn } from '@/shared/utils/cn';

import { kilometresText, minutesText } from './format';
import { WAY_LABEL, type Way } from './recording-rules';

interface StatsStripProps {
  /** Time recorded so far, pauses left out. */
  elapsedSeconds: number;
  distanceM: number;
  way: Way;
  /** Stopped for now: the third column says so. */
  isPaused: boolean;
}

interface StatProps {
  label: string;
  value: string;
  unit?: string;
  className?: string;
}

function Stat({ label, value, unit, className = '' }: StatProps) {
  return (
    <div className={className}>
      <dt className="text-base/6 text-content-quaternary">{label}</dt>
      <dd className="text-2xl/8 font-bold text-content-secondary">
        {value}
        {unit && <span className="text-content-quaternary"> {unit}</span>}
      </dd>
    </div>
  );
}

/**
 * Figma's progressive blur: four layers of 3px blur, each masked to come in
 * over its own quarter, so the map is clear at the top of the strip and
 * blurred by 6px (the four together) at the bottom. They reach 24px above the
 * strip, so the blur has a run-up and no edge.
 */
const BLUR_LAYERS = [
  '[mask-image:linear-gradient(to_bottom,transparent_0%,black_25%)]',
  '[mask-image:linear-gradient(to_bottom,transparent_25%,black_50%)]',
  '[mask-image:linear-gradient(to_bottom,transparent_50%,black_75%)]',
  '[mask-image:linear-gradient(to_bottom,transparent_75%,black_100%)]',
];

/**
 * The figures over the bars: time and distance, and the way the recording is on.
 * They change every second, so nothing here is a live region; the switch of way
 * is announced once on its own (RecordingScreen).
 */
export function StatsStrip({ elapsedSeconds, distanceM, way, isPaused }: StatsStripProps) {
  return (
    <div
      role="group"
      aria-label="Recording so far"
      className="relative bg-surface/5 px-4 pb-4 font-sn-pro"
    >
      {BLUR_LAYERS.map((mask) => (
        <span
          key={mask}
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 -top-6 bottom-0 backdrop-blur-[3px]',
            mask,
          )}
        />
      ))}
      <dl className="relative flex gap-4">
        <Stat className="flex-1" label="Time" value={minutesText(elapsedSeconds)} unit="min" />
        <Stat className="flex-1" label="Distance" value={kilometresText(distanceM)} unit="km" />
        <Stat
          className="shrink-0 text-right"
          label={isPaused ? 'Stopped' : 'Recording'}
          value={WAY_LABEL[way]}
        />
      </dl>
    </div>
  );
}
