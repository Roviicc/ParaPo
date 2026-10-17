import { useEffect, useRef } from 'react';

interface GeolocationWatchHandlers {
  onFix: (position: GeolocationPosition) => void;
  onError: (error: GeolocationPositionError) => void;
}

/**
 * Watches the phone's position at high accuracy while `active`, and lets the
 * watch go when it is not. The handlers are read from a ref, so a new function
 * on every render does not restart the watch.
 */
export function useGeolocationWatch(active: boolean, handlers: GeolocationWatchHandlers): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!active || !('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => latest.current.onFix(position),
      (error) => latest.current.onError(error),
      { enableHighAccuracy: true, maximumAge: 0 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [active]);
}
