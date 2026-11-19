# Athea Digital internal dashboard

Private dashboard for the two founders, Damz and Das. Gabriel and clients never get access.

## Hard rules
- Never run `git push`, `git commit`, `netlify deploy` or anything that publishes. The owner does those by hand. Do not stage files unless the owner asks.
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
- `netlify/functions/` login, logout, session, data, records, site-check (every 30 min), pagespeed (daily, only with `PAGESPEED_API_KEY`), snapshot (daily, keeps 14).

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
