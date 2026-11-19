# Athea Digital internal dashboard

Private dashboard for the two founders, Damz and Das. Gabriel and clients never get access.

## Hard rules
- Never run `git push`, `netlify deploy` or anything that publishes, and never touch Netlify's deploy lock. The owner does those by hand.
- Commit only when the owner types "approve". Stage the changed files by name, never `git add -A` or `git add .`.
- Never read, print, log or commit `.env*` files or any secret. Secrets live in Netlify environment variables only.
- Never store client passwords, bank details or card numbers. Every free-text field shows "No passwords or banking details here." and the server rejects text that looks like one (`src/shared/sensitive.ts`).
- Everything is `noindex` (meta tag, `X-Robots-Tag` header, `robots.txt`).
- No analytics and no third-party requests from the browser. Fonts are self-hosted.
- Seed data holds only the confirmed facts in `src/shared/seed.ts`. Never invent leads, amounts or hours.
- No VAT anywhere: Athea is not VAT-registered.

## Layout
- `src/domain/` pure business rules, each with a Vitest file. Dates are `YYYY-MM-DD` strings in Africa/Johannesburg; use `src/domain/dates.ts`, never `new Date('YYYY-MM-DD')`.
- `src/shared/` zod schemas, seed, the versioned mutation engine and the sensitive-text guard. Imported by the client and the Netlify functions.
- `src/data/` the `DataStore` interface, `LocalStorageAdapter` (dev, tests) and `HttpAdapter` (production, backed by Netlify Blobs through the functions).
- `src/screens/` one file per screen; `src/components/` the glass UI kit (`ui.tsx`), the generic `RecordForm` (`form.tsx`), hand-rolled SVG charts and the logo.
- `netlify/functions/` login, logout, session, data, records, site-check (every 30 min), pagespeed (hourly, scores one site per run and each site at most once a day, only with `PAGESPEED_API_KEY`), snapshot (daily, keeps 14). Shared server code is in `netlify/lib/`.
- `tests/e2e/` Playwright: screenshots, overflow and console checks, edit conflicts, and the production build under the real CSP.

## Commands
```
npm run dev          Vite dev server with LocalStorageAdapter and seed data
npm run typecheck    tsc --noEmit for app, functions and scripts
npm run lint         eslint
npm test             vitest
npm run build        typecheck + vite build
npm run screenshots  Playwright: every screen at 390 and 1440 px into screenshots/
npm run hash-pass    generate a passphrase hash locally (prompts, never echoes)
```
All of typecheck, lint, test, build and screenshots must pass before a change is done. `screenshots` needs a fresh `npm run build` for the CSP test.

## How it fits together
- **One mutation engine.** `LocalStorageAdapter` (dev) and the records function (`handleRecords` in `netlify/lib/handlers.ts`, production) both apply writes through `applyMutation` in `src/shared/mutate.ts`, so dev and production behave the same. `HttpAdapter` only posts to `/api/records`.
- **No silent overwrites.** Every record carries a `version`. A write sends `expectedVersion`; a mismatch returns 409 and the UI shows a conflict prompt with both versions. `RecordForm` freezes the base version when it opens, so a background refresh never rebases a draft. Keep it that way in any new form.
- **Atomic server writes.** Each collection is one Blobs entry, written with ETag conditions (`onlyIfMatch` / `onlyIfNew`) and retried on contention.
- **Seed stays out of the public bundle.** The server writes the seed on first read. The client imports the seed, `LocalStorageAdapter` and `sample.ts` only dynamically, in dev. After a build, `dist/assets/*.js` must not contain "Southern Rebellion", "Hair@77" or "SAMPLE Lead".
- **Function responses set their own headers** (`netlify/lib/http.ts`). `[[headers]]` in `netlify.toml` cover static files only.
- **Login.** scrypt hashes from env vars, a `__Host-` HMAC cookie valid 14 days. The per-IP limit (5 per 15 min) counts the attempt before checking the passphrase; per-user failures only slow down, so nobody can lock a founder out.
- **Site checks.** `netlify/lib/sitecheck.ts` resolves DNS once through a lookup that refuses private addresses and connects to that exact address (SSRF guard, no rebinding gap). It reads the certificate with `rejectUnauthorized: false` so an expired certificate is reported, not hidden.

## Decisions already made (ask the owner before changing)
- `--muted` is `#9aafa8` and `--bad` is `#fb8585`, lightened from the brief so text on glass passes WCAG AA. `src/styles/contrast.test.ts` enforces it.
- Fields added beyond the brief: `clientDelayDays`, `weeklyHoursCommitted`, `retainerDecision`, `followUpsDone`, `lostFromStatus`, and a Sites collection. Unknown facts are stored as `null` and shown as "Unknown" or "Not set", never guessed.
- Seed statuses are placeholders until the owner confirms them; the notes in `src/shared/seed.ts` say which. Settings that still need a decision carry an Unconfirmed flag (`settings.unconfirmed`) and show on the Settings screen. Don't treat either as confirmed.
- Monthly follow-ups fall on the go-live day each month from month 2. Gabriel's sale commission counts as owed once a price is set. CSV dates are read day/month/year.
- Syne 800 is for headings only. KPI figures use DM Sans bold with slashed zeros, because Syne's 0 reads as "o".
- The AD logo is a traced SVG (`src/components/Logo.tsx`, `public/favicon.svg`). Don't swap in the raster file: it is black on white.

## Traps already hit
- An absolutely positioned element (such as `sr-only`) inside a horizontal scroller escapes it and widens the page. `.scroll-x` is `position: relative` for this reason, and Playwright fails on any horizontal page overflow.
- The strict CSP (`default-src 'self'`, no inline script or style in HTML) means no CDNs, no `<style>` tags and no third-party requests. React `style` props are fine.
- Typing the backslash-u-FEFF escape through the editing tools produces a real BOM character, which fails lint. Use `charCodeAt(0) === 0xfeff` instead.
- A `useEffect` body must not return a value; use braces around single-statement effects.
- Never call `new Date("YYYY-MM-DD")` for business dates: it parses as UTC and shifts the day in Johannesburg.
