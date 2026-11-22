# Review verification

Verified 2026-11-20. Application source is commit d5053a5. The review preview is Worker version `d4ffc6d5-38e6-4283-a431-2dba8c4cf0cf`. Subsequent handoff edits change documentation.

| Check | Result |
| --- | --- |
| Dependency audit | Zero known vulnerabilities across the locked dependency tree. |
| Tracked-history credential patterns | Zero matches across 30 baseline text blobs. |
| Local HTTP suite | Six tests passed, including source/member rate limits, failed-PIN bounds, cookie authority, isolation, concurrent mutations, expiry and cleanup. |
| Persisted-data upgrade | A room created by baseline 13367f2 retained its signed host cookie, guest membership, pixel state and operation receipt after restarting current code. |
| Local desktop/mobile browser flow | Passed. Touch, arrow/Enter paint, literal untrusted nickname text, reload, offline paint retry and End. |
| Preview API and browser flow | Passed through the real public deployment. Local expiry/capacity fixtures are exercised in CI. |
| Preview sign-in admission | 20 incorrect guesses returned 401. The next returned 429 with Retry-After. |
| Preview asset and header check | All eight browser assets matched the candidate. CSP, no-referrer and nosniff headers were present. |
| Public CI on application and handoff source | [Run 44693255352 passed](https://github.com/String-sg/live-learn-component/actions/runs/44693255352). The pull request links the final head checks. |

## Five-minute preview load

| Measure | Observed | Acceptance |
| --- | ---: | ---: |
| Students retained | 100 | 100 |
| Active time | 300.000 s | 300 s |
| Join p95 | 405 ms | ≤ 1,500 ms |
| Paint p95 | 244 ms | ≤ 1,500 ms |
| Poll p95 | 43 ms | — |
| Slowest Start observed | 1,543 ms | ≤ 3,000 ms |
| Slowest End observed | 1,655 ms | ≤ 3,000 ms |
| New paints | 400 | ≥ 400 |
| Replayed paints / reconnects | 10 / 10 | 10 / 10 |
| Unexpected errors | 0 | 0 |

All 100 HTTP clients observed Start and End and checked the final canvas. Final revision 502 matches 100 joins, Start, 400 paints and End. There were 20,578 requests, including 19,367 unchanged polls. The runner used one room and one network path. The browser flow was measured separately with desktop and mobile emulation.

Reproduce the local evidence with `npm run test:upgrade`. To repeat load, supply only the isolated preview's `HOST_PASSPHRASE` and `BASE_URL`, then run `npm run test:load`.
