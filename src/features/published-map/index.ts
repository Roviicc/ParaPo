// The published map: the feature's public API, what the shells import. Add a line
// when something outside the feature needs more; nothing outside imports its
// inner files (.claude/CLAUDE.md, Import rules). Written with the restructure
// of 2026-10-07.
export {
  fetchIndex,
  loadDirectionsFromFile,
  loadHotspotsFromFile,
  openingDirections,
} from './api/fetch-index';
export { fetchLine } from './api/fetch-line';
export { MAP_FILE_TOO_NEW } from './map-file';
export { Notices } from './notices';
export { registerServiceWorker, reloadForNewerApp, reloadToUpdate, useNeedRefresh } from './pwa';
export { useMapAge, useOffline } from './status';
