---
status: accepted
date: 2026-10-24
---

# The contributor app is a Capacitor Android app

[ADR 0004](0004-location-leaves-the-phone-only-by-choice.md) put recording on a
contributor page. A web page can't keep recording once the screen goes off, and
that is what a ride needs. On 2026-10-24 the owner asked for the contributor to
be a downloadable APK, and a spike on the owner's phone (PR #385, never merged)
settled the open risks.

The contributor app is the contributor page's own React code inside a native
Android shell made with Capacitor. It is Android only, installed from a direct
download link rather than the Play Store, and its location comes from
`@capacitor-community/background-geolocation`, which runs as a foreground
service with a visible "ParaPo is recording" notification.

## Consequences

- One codebase. The app is `features/contribute/` and `app/contribute/`;
  `vite.apk.config.ts` builds that page's entry only, `capacitor.config.ts` and
  `android/` wrap it, and the app runs from its own files, offline.
- The web bundle carries no Capacitor code. `@capacitor/core` is imported only
  when the build mode is `apk` (`native-app.ts`), and
  `scripts/checks/check-build.mjs` proves on every build that no web chunk
  holds it.
- The app's build reads `.env.apk`, which holds only public values, like
  `.env.production`. Turnstile passes at the app's own origin,
  `https://localhost`, with no Cloudflare change.
- A GitHub workflow builds a debug APK on pull requests that touch the app and
  an unsigned release APK on a tag `app-v*`, on the runner's own Android SDK.
  Signing, the download link and the update check are separate work
  (`.scratch/contributor-app/`, tickets 04 and 05).
- A downloaded APK does not update itself. The signing key must never change
  and never be lost: a new key means testers uninstall and lose unsent
  recordings.
- Rejected: a wrapped web page (a Trusted Web Activity), which can't record
  with the screen off; a separate native app, which would rewrite the recorder;
  an iPhone build, for now.
