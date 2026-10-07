/**
 * The studio's dialogs on a phone (narrower than 40rem): a sheet that fills
 * the screen, clear of the notch and the home bar, with its buttons held at
 * its foot while the form scrolls, so the keyboard never hides Save. Wider,
 * they stay a card in the middle of the map, as they were.
 */

/** The dimmed layer over the map, holding the dialog. */
export const OVERLAY =
  'absolute inset-0 z-20 grid place-items-center bg-black/30 p-4 max-sm:place-items-stretch max-sm:p-0';

/** A long form (SavePanel, HotspotPanel): a card, or the whole screen on a phone. */
export const PANEL =
  'max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl ' +
  'max-sm:h-full max-sm:max-w-none max-sm:rounded-none max-sm:pt-[calc(1.5rem+env(safe-area-inset-top))]';

/** A long form's Cancel and Save, kept at the bottom of the screen on a phone. */
export const FOOTER =
  'mt-5 flex gap-2 max-sm:sticky max-sm:-bottom-6 max-sm:-mx-6 max-sm:border-t max-sm:border-neutral-200 ' +
  'max-sm:bg-white max-sm:px-6 max-sm:pt-3 max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]';

/**
 * A field's text: 16 px on a phone, under which iOS zooms the page in when
 * the field is focused; 14 px wider, as before.
 */
export const FIELD_TEXT = 'text-base sm:text-sm';
