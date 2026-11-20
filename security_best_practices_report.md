# Security review

Reviewed 2026-11-20 against baseline commit 13367f2a6fe2125b3303f68eb295d515b9d7d600.

Two medium-severity findings were reproduced on disposable local Worker storage and fixed in this review branch. Both regression tests now pass, including independent callers, receipt replay and counter cleanup. The locked dependency audit reported zero known vulnerabilities. A credential-pattern scan found zero matches across 30 text blobs in the tracked history. The audit covered application source, test fixtures, CI permissions and the hosting configuration.

## Medium findings

### SEC-001 — Host sign-in accepts unlimited guesses

Baseline evidence is `src/worker.js:75` through line 77. Each request goes directly to `auth.login`. The local regression sent 20 incorrect guesses from one source, then confirmed the next request was still processed.

A remote client can automate passphrase guessing and consume authentication compute. The deployed high-entropy passphrase reduces guess success probability, while request admission still needs a bound.

Acceptance R1 limits each source to 20 sign-in attempts per minute and returns Retry-After. Tracking uses a salted source hash. This follows the OWASP login throttling guidance. [Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#login-throttling)

### SEC-002 — A member can rapidly consume the shared paint allowance

Baseline evidence is `src/rooms.js:126` through line 131. The room-wide 30,000-paint cap has no per-member admission bound. The local regression committed 61 unique operations in a burst from one guest.

A participant with the room PIN can consume the shared allowance and prevent the rest of the class from painting. Acceptance R2 allows 60 new paints per member per ten-second window, checks existing receipts first, and permits other members to continue. The counter and mutation execute in the same synchronous storage transaction.

## Checked boundaries

Parameterized SQLite statements scope guests and receipts to the internal room ID. Host commands verify the signed session and owner. Guest cookies never authorize host commands. The HTTP layer checks origins and bounds JSON bodies. Nicknames reach textContent. The Content Security Policy allows same-origin scripts and denies framing. GitHub Actions has read-only repository permissions and pinned action commits.

## Remaining limits

The demo uses one provisioned host identity and a stateless eight-hour signed cookie. Sign-out clears the browser cookie. A copied cookie remains valid until expiry or signing-key rotation. Per-source login limits can be bypassed by distributed clients. Per-member limits can be bypassed by creating additional memberships up to the room cap. Platform traffic controls and multiple-host identity integration require deployment-specific decisions.

The room service uses one Durable Object per environment. This review covers one-room correctness and bounded application admission. Multi-room capacity and infrastructure denial of service require separate measurement. The credential scan uses explicit patterns and the dependency audit reflects the registry snapshot on the review date.
