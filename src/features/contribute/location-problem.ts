/** What a failed location request means for the contributor, in words and what to do. */
export function locationProblem(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Location is blocked for this page. Allow it in the browser settings, then start again.';
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return 'The phone could not work out where it is. Check that location is on.';
  }
  return 'The phone took too long to find its position.';
}
