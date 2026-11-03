# Pocket Ledger

A private, iPhone-only money tracker that runs as a Home Screen web app. All financial data stays on the phone
(IndexedDB). Cloudflare only serves the static files. See [expense-tracker-spec.md](expense-tracker-spec.md).

## Develop

```sh
npm install
npm run dev        # open http://localhost:5173/?dev to skip the "install to Home Screen" screen
npm test           # pay periods, balances, budgets, recurring schedules, backup validation
npm run build
```

## Deploy to Cloudflare

The app deploys as an assets-only Worker named `montrack` (see `wrangler.jsonc`), so it lives at
`https://montrack.<your-subdomain>.workers.dev`.

```sh
npx wrangler login   # once, opens a browser
npm run deploy       # builds, then uploads dist/
```

Keep the URL stable. A different domain or Worker name is a different app on the iPhone, with separate storage.
Security headers (CSP and others) come from `public/_headers`.

To test locally with the production headers: `npm run build && npx wrangler dev`.

## Install on iPhone

Open the URL in Safari, tap Share, then Add to Home Screen, and open the app from its icon. Safari tabs show
install instructions instead of the app, because Safari and the Home Screen app keep separate data.

## Layout

- `src/lib/` holds the logic, with no UI: dates, money (integer cents), pay periods, ledger math, recurring
  schedules, the Dexie schema, writes (`actions.ts`), PIN hashing (PBKDF2), backup/restore, and CSV.
- `src/screens/` has one file per screen. `src/components/` has the shared UI.
- Schema changes go in a new `db.version(n)` block in `src/lib/db.ts`; never edit an old one.
