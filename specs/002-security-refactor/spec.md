# Security review and component refactor

Created 2026-11-20. Baseline commit 13367f2a6fe2125b3303f68eb295d515b9d7d600.

## User journeys

1. A maintainer reviews the host, guest and storage trust boundaries, sees reproducible findings, and can verify each fix.
2. A developer follows each original Spec Kit acceptance case to its implementation and public test.
3. An integrator can reuse the canvas widget and HTTP boundary without untangling page navigation and reconnect state.

## Acceptance cases

- **R1** A source can attempt at most 20 host logins per minute. Further attempts return 429 and Retry-After. A different source can sign in. The limit resets after its window and expired tracking data is removed.
- **R2** One member can commit at most 60 new paints per ten-second window. A different member can still paint. Replaying a committed operation returns the same receipt even at the limit. A reset permits new paints. End keeps the board frozen.
- **R3** Original A1–A9 and expiry/capacity tests pass. The DOM renders nicknames as text. Host/guest authority, input bounds and cross-origin rejection remain covered through HTTP.
- **R4** The browser canvas exposes a small render interface and a paint callback. Its keyboard and touch interactions pass the existing independent-client test.
- **R5** The HTTP utility owns bounded JSON parsing, response headers, hashing and cookie serialization. Host authentication stays replaceable. Existing stored rooms, guests and operation receipts survive the additive schema change.
- **R6** The review handoff links the original requirements, current implementation, test evidence, security findings and remaining limits. A public pull request and passing CI identify the reviewed commit.

## Scope

Review all tracked application, test, CI and configuration files. Refactor where a responsibility can be extracted cleanly. Use the existing JavaScript and Cloudflare stack. Validate new schema against a store created with the baseline code.
