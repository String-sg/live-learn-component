# Feature Specification: Live classroom rooms

**Feature**: 001-live-rooms
**Created**: 2026-11-09
**Input**: Build an independent reusable room component and a public collaborative pixel-canvas demo. The classroom lifecycle was informed by String Bingo PR #86.

## User scenarios and acceptance tests

### US1 · Host a room (P1)

A teacher signs in, creates a waiting room, shares the PIN, and starts and ends the activity. This establishes who controls the class.

1. **A1** Signed-out clients and guest cookies receive 401 on host commands. Wrong host credentials receive 401. An authenticated non-owner receives 403 on the room.
2. **A2** Concurrent creates with the same request ID return the same PIN. The PIN is valid for two hours. Waiting guests can see the count and board but cannot paint.
3. **A3** The host can Start and End. Repeat either command without a second transition. End closes a waiting or active room to new joins and edits. Existing guests see the final canvas. A late Start cannot reopen the room.

### US2 · Join and paint together (P1)

A student joins in a separate browser by entering the PIN and a nickname. The whole room sees edits from other students.

1. **A4** Two independent browsers join from a PIN or invite link and see the host's Start. Each paints a different cell at the same time. Both changes reach the host and both guests. Simultaneous writes to one cell resolve to one server-ordered colour.
2. **A5** A valid PIN alone permits no board read or paint. A guest cookie from room A cannot read or paint room B. Painting with a room B guest never changes room A.
3. **A6** Missing, invalid, expired and ended PINs give actionable errors. The room accepts up to 120 students, including multiple students with the same nickname.

### US3 · Resume and retry (P2)

A student reloads or temporarily loses their network and resumes with the same browser. The activity continues without duplicate participants or edits.

1. **A7** A refresh or interrupted poll recovers the latest revision and same membership. Replaying a concurrent join with the same browser key returns the same membership.
2. **A8** Replaying an acknowledged pixel operation returns its original receipt without repainting over newer work. Reusing its ID for a different payload is rejected.
3. **A9** During an End race, a new paint is committed before End or rejected after End. The canvas is frozen once End is visible.

## Functional requirements

- **FR-001** Resolve host identity at the HTTP boundary. The room core receives a verified stable host subject.
- **FR-002** Generate random eight-digit PINs. Each room has a unique internal ID and a fixed two-hour lifetime. End freezes a room. Expiry revokes access and stored room data is cleaned up.
- **FR-003** Guest membership is issued on join and resumed using an opaque room-scoped cookie. Collect only a nickname, activity data and the credentials needed to resume.
- **FR-004** Store authoritative room state, guest count and 16 × 16 canvas. Use a monotonically increasing revision for incremental reads and serialized writes.
- **FR-005** Make create, join, Start, End and paint safe to retry. Keep mutation receipts inside their room lifetime.
- **FR-006** Validate user input, bound room size and failed PIN attempts, and expose neither credentials nor a guest roster through snapshots.
- **FR-007** Support touch and keyboard play. Expose waiting, live, disconnected, ended and expired states.
- **FR-008** Publish source and reproducible tests. Exercise the deployed application with synthetic identities and run load on independent preview storage and secrets.

## Success criteria

- **SC-001** A1–A9 pass against the app's real HTTP boundary. Browser tests use separate host and guest contexts at desktop and mobile widths.
- **SC-002** Over 300 seconds of active play, 100 independent HTTP guests join and remain in one isolated preview room. All see Start and End within 3 seconds in a foreground-style polling loop. Join and edit p95 are each at most 1.5 seconds.
- **SC-003** The rehearsal includes at least 400 paints, duplicate deliveries, 10 reconnects, and no unexpected errors. Record workload, latency, request counts and deployment limits.
- **SC-004** Public GitHub Actions and demo links can be opened without signing in. Host controls require a provisioned credential.

## Assumptions

The demo has one provisioned host identity per environment. Integrators can provide their own identity resolver. Rooms are temporary and the public demo is for synthetic activity. Guests must keep their browser cookie to resume.
