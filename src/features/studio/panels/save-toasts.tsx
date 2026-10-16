import { hotspotLabel, type HotspotRow } from '@/features/routes/model/hotspots';
import type { DirectionRow } from '@/features/routes/model/routes';

import { Toast } from './toast';

/** The workshop's one toast: a save's, or a problem. */
export type SaveToast =
  | { kind: 'route'; v: DirectionRow }
  | { kind: 'hotspot'; s: HotspotRow }
  | { kind: 'notice'; text: string };

interface SaveToastsProps {
  toast: SaveToast | null;
  /** While drawing, the two saved toasts hide; a notice shows regardless. */
  isDrawing: boolean;
  /** The route just saved still has a direction to draw: its toast offers it (returnTripLeft). */
  canDrawReturnTrip: boolean;
  onDismiss: () => void;
  onDrawReturnTrip: (routeId: string) => void;
}

/**
 * The toast the workshop holds, whichever kind it is: a hotspot saved, a
 * route saved (with "Draw the return trip" while a direction is undrawn), or
 * a notice. The workshop keeps the one value; this only shows it. Each kind
 * is keyed as its own toast, so another kind mounts afresh, as the three
 * siblings did: a notice replacing a saved toast is announced as an alert,
 * not a status that changed its role.
 */
export function SaveToasts({
  toast,
  isDrawing,
  canDrawReturnTrip,
  onDismiss,
  onDrawReturnTrip,
}: SaveToastsProps) {
  if (toast?.kind === 'hotspot' && !isDrawing) {
    return (
      <Toast key="hotspot" onDismiss={onDismiss}>
        Saved {toast.s.kind === 'terminal' ? 'terminal' : 'hintuan'}{' '}
        <strong>{hotspotLabel(toast.s)}</strong>
      </Toast>
    );
  }

  // After a save, the other direction is almost always next — while there is one to draw.
  if (toast?.kind === 'route' && !isDrawing) {
    return (
      <Toast
        key="route"
        onDismiss={onDismiss}
        action={
          canDrawReturnTrip && (
            <button
              type="button"
              onClick={() => onDrawReturnTrip(toast.v.routeId)}
              className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-900"
            >
              Draw the return trip
            </button>
          )
        }
      >
        Saved <strong>{toast.v.route?.name}</strong> · {toast.v.name}
      </Toast>
    );
  }

  if (toast?.kind === 'notice') {
    return (
      <Toast key="notice" tone="alert" onDismiss={onDismiss}>
        {toast.text}
      </Toast>
    );
  }

  return null;
}
