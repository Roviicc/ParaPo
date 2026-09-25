// Lets Node's own test runner import the app's TypeScript as it is written.
//
//   node --experimental-strip-types --import ./scripts/ts-resolve.mjs <test>
//
// The app imports its own modules without extensions ('./geo'), which Vite
// and tsc resolve and Node does not. This hook tries `.ts` and `.tsx` for
// such a relative import; everything else goes to Node untouched.
import { register } from 'node:module'
register('./ts-resolve-hook.mjs', import.meta.url)
