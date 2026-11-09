# Live Learn Component Constitution

1. **Server-owned authority.** Only a verified room owner creates, starts and ends a room. A PIN is an invitation. A browser credential is membership. The server checks every read and mutation.
2. **Small, isolated rooms.** Scope every record and command to one room, and atomically commit each change and its retry receipt. Delete demo data on a fixed schedule.
3. **Evidence at the boundary.** Prove the public interface using independent browser and HTTP clients. Use fresh synthetic rooms and an isolated deployment for load. State what the measurements cover.
4. **Replaceable host identity.** Keep host authentication at the HTTP boundary. The room core takes a verified host subject and does not depend on a specific login provider.

Version 1.0.0 · 2026-11-09
