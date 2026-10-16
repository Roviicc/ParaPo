// The studio: the feature's public API, what the shells import. Add a line
// when something outside the feature needs more; nothing outside imports its
// inner files (.claude/CLAUDE.md, Import rules). Written with the restructure
// of 2026-10-07.
export { AuthDialogs } from './auth/auth-dialogs';
export { SignIn } from './auth/sign-in';
export { skipSignInForTests } from './auth/test-bypass';
export { usePasswordRecovery } from './auth/use-password-recovery';
export { useSession } from './auth/use-session';
export { lineOf, listDirections, loadHotspotsFromSupabase } from './data/live';
export { signboardUrl } from './data/signboards';
export { getSupabase, setSupabase, supabaseConfig, supabaseConfigError } from './data/supabase';
export { DrawToolbar } from './drawing/draw-toolbar';
export { STUDIO_BASEMAPS, STUDIO_BASEMAP_THUMBNAILS } from './drawing/studio-basemaps';
export { useDrawing } from './drawing/use-drawing';
export { useFollow } from './drawing/use-follow';
export { AccountPill } from './panels/account-pill';
export { CardActions } from './panels/card-actions';
export { HotspotPanel } from './panels/hotspot-panel';
export { NewButtons } from './panels/new-buttons';
export { returnTripLeft } from './panels/return-trip';
export { SavePanel } from './panels/save-panel';
export { SaveToasts, type SaveToast } from './panels/save-toasts';
export { TripCardExtras } from './panels/trip-card-extras';
export { useDeleteActions } from './panels/use-delete-actions';
export { useSaveTarget } from './panels/use-save-target';
