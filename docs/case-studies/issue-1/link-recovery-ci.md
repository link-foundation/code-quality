# Repeated transient URLs and CI recovery

Candidate `58e3221e54d7fdf53be2252398e83f0ffed39dff` was created before the
2026-11-18 00:36:54 UTC workflows. The
[link workflow](https://github.com/link-foundation/code-quality/actions/runs/44209263921)
failed on attempt one. Its complete log is retained locally as
`ci-logs/links-44209263921.log`.

The log reports 19 transient occurrences (lines 256, 345), then 18 recovered URLs
and zero remaining failures (line 360). The Husky URL appears twice in the error
section (lines 296 and 310). The archive fallback also reports no broken URLs
(line 383). The final guard still fails at lines 452 and 485; the status job
correctly propagates that failure at line 705.

`recheckUnanswered` deduplicates requests, but its caller compared the number of
unique recovered URLs with the number of original occurrences. A repeated
transient URL therefore left `all_recovered` unset even when every unique URL
answered successfully. This is a count-domain mismatch, not a broken source URL.

The original regression runs the actual CLI against a bounded local HTTP server.
Two transient occurrences of one healthy URL reproduce the failed output assertion
before correction (`false !== true`). A second case adds a definitive 404 for that
same URL; the recovery output must remain absent despite the healthy response.
The correction deduplicates transient URLs before both requests and counting.
Final-error inventory and incomplete/malformed-report refusals remain unchanged.

Verification: `tests/recheck-broken-links.test.js` includes the regression and
retains its preceding acceptance assertions. Full candidate CI must be collected
before the next publication batch.
