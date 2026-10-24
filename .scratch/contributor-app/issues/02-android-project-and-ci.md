# 02: The Android project and its build

Status: claimed
Type: task
Who: a session
Blocked by: — (the spike, #385, is the reference; copy what worked, not its test-only panel)

- `capacitor.config.ts`, `android/` (appId `ph.parapo.contributor`, name "ParaPo Contributor"), `vite.apk.config.ts` + `.env.apk` building the contributor page's entry only; `@capacitor/core` imported in the app build only (the web bundle carries none: extend `scripts/checks/check-build.mjs` to prove it).
- `.env.apk`: the real Supabase URL, publishable key and Turnstile site key (all public), `VITE_CONTRIBUTIONS=1`. The app is the contributor page.
- A GitHub workflow building a **release** APK on a tag `app-v*` (and a debug APK on pull requests that touch the app), with the runner's own SDK. Version name/code from the tag. Signing comes in 04: until then, release builds are unsigned and not published.
- The app icon and splash from the existing PWA icons; status bar and safe areas handled (the spike's lesson: nothing under the status bar).
- CLAUDE.md: Stack (Capacitor, the plugin) and Folder structure (`android/`) lines; an ADR "The contributor app is a Capacitor Android app" (the plan's reasons).
- `npm run check` passes; the workflow is green.
