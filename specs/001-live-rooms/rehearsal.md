# 100-student preview rehearsal

Run on 9 November 2026 SGT against the isolated Cloudflare preview, Worker version `dfa5ac58-829a-4255-bdb0-bd304782d10a`. The rehearsal used one synthetic host and 100 independent HTTP clients from one test runner. Each client held its own guest cookie. Preview and production have separate Worker secrets and SQLite Durable Object namespaces.

| Measure | Observed | Acceptance target |
| --- | ---: | ---: |
| Students retained through End | 100 | 100 |
| Active play | 300.002 s | 300 s |
| Join response p95 | 1,038 ms | ≤ 1,500 ms |
| Paint response p95 | 598 ms | ≤ 1,500 ms |
| Poll response p95 | 222 ms | — |
| Slowest Start observed | 1,718 ms | ≤ 3,000 ms |
| Slowest End observed | 1,703 ms | ≤ 3,000 ms |
| Unique paints | 400 | ≥ 400 |
| Paint retries / student reconnects | 10 / 10 | 10 / 10 |
| Unexpected errors | 0 | 0 |

All 100 students observed both transitions and verified the final canvas. The host saw final revision 502, matching 100 joins, Start, 400 unique paints and End. The runner recorded 19,703 HTTP responses, including 18,475 unchanged polls with empty bodies.

This is one room, one network path and a foreground polling workload. Separate Chromium tests cover the browser flow on desktop and mobile viewports.

The implementation caps rooms at 120 guests, 30,000 unique paints and a two-hour lifetime. With this workload, one room used about 3,941 requests per minute. If deployed on Workers Free, the published 100,000 daily request quota corresponds to roughly 25 minutes at that rate if the account has no other Worker traffic. Durable Object usage also follows the hosting plan. [Worker limits](https://developers.cloudflare.com/workers/platform/limits/) · [Durable Object quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/)

[Load runner](../../tests/load.js) · [Run instructions](../../README.md#deploy-and-rehearse)
