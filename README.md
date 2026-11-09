# Live Learn Component

Host-led rooms for browser activities, with a shared pixel canvas as the example. A host signs in and shares an eight-digit PIN. Students join with nicknames, wait for Start, and paint on the same canvas. They keep their place if they reload in the same browser.

[Live demo](https://live-learn-component.leekahhow.workers.dev) · [GitHub Actions](https://github.com/String-sg/live-learn-component/actions/workflows/test.yml) · [Spec and acceptance cases](specs/001-live-rooms/spec.md)

The public demo is for synthetic activity. Use made-up nicknames. The deployment operator provisions host access.

## Run and test

Use Node 22 or later.

```sh
npm ci
npx playwright install chromium
npm run test:local
```

The command starts a fresh local Worker and SQLite store, generates disposable host credentials, runs the HTTP and Chromium tests, and tears down the store. It covers host and guest authority, isolation, simultaneous edits, retries, browser reloads and reconnects, and End. The local expiry fixture is separate from the deployed entrypoint. On a Linux runner without browser system dependencies, use `npx playwright install --with-deps chromium`.

To try the app manually, create a local `.dev.vars` file with a high-entropy `HOST_PASSPHRASE` and a different high-entropy `HOST_SIGNING_KEY`. Run `npm run dev` and open `http://127.0.0.1:8787`. Use a second browser profile or private window to join as a student.

To run the API or browser checks against a deployment you own, export `BASE_URL` and `HOST_PASSPHRASE` for that deployment, then run `npm run test:api` or `npm test`. The suite creates and ends synthetic rooms.

## Reuse the room lifecycle

`src/rooms.js` owns room state. The Worker in `src/worker.js` validates commands and resolves authority before calling the store. For an existing identity provider, replace the demo adapter passed to `createWorker`. Its `read(request, env)` returns a stable verified host subject or null. The demo login and logout methods return the corresponding `Set-Cookie` value. Use your own identity provider's sign-in flow if your app already has one.

For another activity, keep room creation, membership, Start, End and expiry. Replace the canvas field and paint command with the activity's state and mutation. Keep receipt lookup and mutation in the same transaction, scoped by the room's internal ID and member. The [HTTP contract](specs/001-live-rooms/plan.md) documents the demo routes.

## Deploy and rehearse

Deploy production and preview with **different** high-entropy values for `HOST_PASSPHRASE` and `HOST_SIGNING_KEY`. Supply each through Wrangler's secret mechanism. The `preview` environment has a separate Worker and Durable Object namespace.

```sh
npx wrangler deploy --env preview --secrets-file /private/path/to/preview-secrets.json
npx wrangler deploy --env "" --secrets-file /private/path/to/demo-secrets.json
```

For the 100-student rehearsal, set `BASE_URL` to the isolated preview URL and supply only its `HOST_PASSPHRASE` through your environment. Run `npm run test:load`. The runner also accepts loopback for a local rehearsal and defaults to 300 seconds of active play. `DURATION_SECONDS=10` runs a shorter smoke test.

[Read the measured five-minute rehearsal](specs/001-live-rooms/rehearsal.md).

The demo uses one SQLite-backed Durable Object per deployment and polls around every 1.5 seconds in an active tab. Each room caps membership at 120 and accepts up to 30,000 unique paint operations. A host can have up to 10 open rooms. Rooms stop accepting commands two hours after creation. An alarm sweeps expired demo records every 15 minutes while there is data to clean up.

The classroom flow was informed by [String Bingo PR #86](https://github.com/String-sg/bingo-string/pull/86).
