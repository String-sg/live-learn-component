# Implementation Plan: Live classroom rooms

## Technical context

Cloudflare Worker and one SQLite-backed Durable Object per deployment. Plain HTML, CSS and browser JavaScript. Playwright covers browser journeys and Node tests the HTTP boundary. Preview runs in a separate Worker with a separate Durable Object namespace and secrets.

## Constitution check

The Worker verifies the host session and scopes guest credentials. The internal store receives a subject and a hashed browser key. All room reads use the active PIN and scope writes and receipts to the room's internal ID. SQLite transactions serialize writes and End. An alarm purges expired rooms and rate-limit records. HTTP polling uses revisions so unchanged reads send an empty response.

## Layout

- `src/worker.js` validates HTTP input and resolves the caller.
- `src/host-auth.js` provides a replaceable demo host sign-in and resolver.
- `src/rooms.js` owns lifecycle, membership, board snapshots and retry receipts.
- `public/` renders the host and student flows. The canvas is also the visual on the entry screen.
- `tests/` exercises the same public routes from independent clients.

## Contracts

- `POST /api/host/login` authenticates a host. `GET /api/host` checks its session and `POST /api/host/logout` clears it.
- `POST /api/rooms` creates a room using a client request ID.
- `POST /api/rooms/{pin}/join` accepts a nickname and browser-generated join key. It sets a room-scoped cookie.
- `GET /api/rooms/{pin}?since={revision}&role={host|guest}` returns an authorized snapshot or 204 for the same revision.
- `POST /api/rooms/{pin}/{start|end}` changes lifecycle under host authority.
- `POST /api/rooms/{pin}/pixels` accepts a cell index, colour and operation UUID from a member.
- Snapshot fields are PIN, status, guest count, pixels, revision and expiration. Guest responses include only that caller's nickname.

## Validation and rollout

Run the HTTP and browser suites on local storage. Verify a 300-second load rehearsal against the isolated preview. Push public source and check GitHub Actions. Publish the demo with distinct production secrets and verify a synthetic host plus independent guest flow.
