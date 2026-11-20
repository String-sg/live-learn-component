# Implementation plan

1. Audit locked dependencies, tracked history for credential patterns, source/sink boundaries and deployment headers. Reproduce security gaps on disposable local data.
2. Add rate limits at host sign-in and member paint admission. Commit the changes with their regression tests.
3. Extract browser canvas rendering/input and browser API calls. Move server HTTP/cookie primitives out of the demo auth module. Keep lifecycle and transactions together in Rooms.
4. Map the original FR-001–FR-008 and A1–A9 to implementation and evidence. Record deferred infrastructure limits explicitly.
5. Run fresh-store and persisted-store checks, browser tests and the isolated preview load runner. Open a public review PR with a scoped handoff.

The deployment retains the Rooms Durable Object class and classroom-v1 name. New rate-limit tables are additive. Room schema and membership credentials keep their current format.
