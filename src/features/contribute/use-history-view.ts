import { createHashView } from './hash-view';

/** Whether History is showing, kept in the URL's `#history`. */
export const useHistoryView = createHashView('#history');
