# 04: Linking earlier recordings

Status: blocked
Type: task
Who: a session
Blocked by: 02

- **Same phone, create account:** nothing to do (the upgrade keeps the id); prove it with a test.
- **Sign in on a phone that has its own anonymous user:** `begin_claim()` before signing in, `finish_claim(token)` after; on failure, the phone keeps the token and retries on the next start. The account's History then shows those uploads.
- **Unsent recordings on the phone** upload under the account after sign-in, under the consent they were made with (v1 never sends on its own, only after the earlier-recordings question's Send; v2 and v3 do).
- Unit tests for the flow's decisions; e2e with mocked Supabase; `npm run check`.
