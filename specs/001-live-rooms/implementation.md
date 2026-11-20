# Implementation and evidence

Updated for the 2026-11-20 review branch. The project uses a Spec Kit constitution, prioritized user journeys, acceptance cases, an implementation plan and task checklists. This table records where the requirements are implemented and how they are verified. The follow-up work is specified in [002-security-refactor](../002-security-refactor/spec.md).

## Functional requirements

| Requirement | Implementation | Verification |
| --- | --- | --- |
| FR-001 — Host identity | `src/host-auth.js` verifies the signed subject. `src/worker.js` resolves that subject before host commands. `Rooms.access` checks ownership. | The HTTP acceptance suite rejects anonymous, guest, forged and authenticated non-owner callers. |
| FR-002 — PIN, lifetime, End | `Rooms.create`, `transition`, `access` and `alarm` own eight-digit PINs, the two-hour lifetime, terminal End and cleanup. | Acceptance checks PIN/TTL, repeated End, late Start and the End/paint race. The isolated fixture expires and sweeps a room. |
| FR-003 — Membership | Join issues a path-scoped HttpOnly cookie. The SQL store holds its hash and nickname under the room ID. | Concurrent join replay, same-nickname independent guests, cookie resume and cross-room denial. The browser key is retained in sessionStorage until the join is acknowledged, then removed. |
| FR-004 — Authoritative state | `Rooms` stores a 256-cell string and monotonically increasing revision. Writes and receipt insertion share one synchronous transaction. | Concurrent different-cell and same-cell writes, conditional 204 reads and independent host/guest observations. |
| FR-005 — Idempotence | Create uses an owner/request-ID unique key. Join keys identify membership. Start/End have terminal checks. Paint receipts bind member, operation and payload. | HTTP replay and conflict assertions, plus the persisted-data upgrade test. |
| FR-006 — Validation and bounds | `src/http.js` bounds JSON to 1 KiB. The Worker validates UUIDs, nickname, cell and colour. Rooms caps membership and failed PIN guesses. `takeLimit` adds sign-in and per-member paint limits. | Capacity, invalid/oversized input, response-field allowlist, rate-limit isolation, Retry-After and cleanup. |
| FR-007 — Touch, keyboard, states | `public/canvas.js` owns the palette, focus and arrow/Enter interactions. `public/app.js` renders lifecycle and reconnect state. | Independent desktop/mobile Chromium contexts exercise touch, keyboard paint, reload, offline retry, literal nickname text and End. |
| FR-008 — Public evidence | Public source, CI and test runners live in this repository. Preview uses its own Worker namespace and secrets. | Public Actions runs and the dated rehearsal report. The current review handoff identifies the branch evidence. |

## Acceptance cases

| Case | Automated evidence |
| --- | --- |
| A1 | `tests/acceptance.test.js` — anonymous, guest, forged host and non-owner denial. |
| A2 | `tests/acceptance.test.js` — concurrent create, PIN/TTL and waiting paint rejection. |
| A3 | `tests/acceptance.test.js` — repeat Start/End, late Start and frozen End. `tests/security.test.js` also closes a waiting room. |
| A4 | `tests/acceptance.test.js` — concurrent writes and server ordering. `tests/canvas.spec.js` — independent browser observations. |
| A5 | `tests/acceptance.test.js` — PIN-only denial and two-room isolation. |
| A6 | `tests/acceptance.test.js` — missing/invalid/expired/ended joins and 120-seat cap. |
| A7 | HTTP concurrent join replay and cookie resume. Browser refresh and network interruption. |
| A8 | HTTP receipt replay, changed-payload rejection and newer-paint preservation. |
| A9 | HTTP concurrent End/paint and post-End rejection. Browser sees the frozen final canvas. |

## Verification scope

SC-001 is covered by the HTTP and independent-browser suites. SC-002 and SC-003 were measured on the isolated preview for 100 HTTP guests over five minutes. Consult the dated [rehearsal](rehearsal.md) and current [review handoff](../../REVIEW.md) for measured revisions and limits. SC-004 is evidenced by the public repository, Actions page and demo URL.

The reusable backend boundary is a verified host subject plus room-scoped membership. The current room state and paint command implement the pixel activity. The browser canvas is reusable through `createCanvas(board, palette, onPaint)`, which returns `render(pixels, canPaint)`.
