# Code review handoff

The review branch adds admission limits around host sign-in and student paints, and extracts the browser canvas and HTTP helpers. Review the security fixes before the component moves. The original room lifecycle is covered by the acceptance suite and a real upgrade from baseline commit `13367f2`.

## Review order

1. [Security report](security_best_practices_report.md). SEC-001 and SEC-002 include baseline evidence, impact, fixes and remaining limits.
2. [Spec Kit implementation map](specs/001-live-rooms/implementation.md). FR-001–FR-008 and A1–A9 link to code and tests. [The follow-up spec](specs/002-security-refactor/spec.md) defines the review/refactor acceptance cases.
3. `src/rate-limits.js`, `Rooms.loginLimit` and `Rooms.paint`. Check concurrent admission, member isolation and receipt lookup before quota accounting.
4. `public/canvas.js` and `src/http.js`. Check keyboard focus, disabled input, same-origin browser requests, cookie attributes, the body bound and error responses.
5. `tests/upgrade.js` and `tests/local.js`. Confirm old host sessions, memberships, room state and receipts survive the additive table change.

## Component boundaries

| Component | Responsibility |
| --- | --- |
| `src/worker.js` | Routes, validated commands and caller resolution. |
| `src/host-auth.js` | Provisioned demo sign-in and signed host subjects. |
| `src/http.js` | JSON size bound, replies, Retry-After, cookies and source hashing. |
| `src/rooms.js` | Lifecycle, membership, ordered canvas writes and receipts in SQLite. |
| `src/rate-limits.js` | Atomic request admission shared by login and paint. |
| `public/canvas.js` | Canvas DOM, palette, keyboard focus and render function. |
| `public/api.js` | Browser requests and room paths. |
| `public/app.js` | Host/student navigation, lifecycle rendering and reconnect/retry state. |

The page controller reduces from 348 to 267 lines. The Worker reduces from 138 to 99 lines. The room transaction stays in one module so a reviewer can see the access check, receipt lookup and write together. The dependency versions retain their existing pins.

## Reproduce verification

Use Node 22 or later and a full Git clone.

```sh
npm ci
npx playwright install chromium
npm audit --audit-level=low
npm run test:upgrade
```

The upgrade run boots the baseline Worker, creates an active synthetic room and paint receipt, restarts current source on the same SQLite store, and checks the original credentials and receipt. It then executes six HTTP tests and the independent desktop/mobile Chromium flow.

For a fresh-store run, use `npm run test:local`. On Linux, install browser system dependencies with `npx playwright install --with-deps chromium`. The public workflow uses the upgrade run.

[Verification results](specs/002-security-refactor/verification.md) include the 100-student, five-minute preview rehearsal. Join p95 was 405 ms, paint p95 was 244 ms and the slowest End observation was 1,655 ms. The run recorded zero unexpected errors.

## Review limits and deployment

The test load covers one room on one network path. The demo uses one host identity and stateless eight-hour sessions. Source-based and member-based admission reduces individual bursts, while distributed traffic and additional memberships need deployment-level controls. See the security report for those residual limits.

The candidate preview is [live-learn-component-preview.leekahhow.workers.dev](https://live-learn-component-preview.leekahhow.workers.dev/). Its storage and secrets are separate from the public demo. The production rollout step after PR approval is `npx wrangler deploy --env ""` from the reviewed commit. A rollback deploys the previously published application revision. The additive request-limit table can remain in the database across a rollback.
