# Issue 1 implementation and verification plan

PR: https://github.com/link-foundation/code-quality/pull/2

The issue and all three PR discussion channels were read on 2026-11-17.
There are no issue comments, human PR comments/reviews, or required sub-issues.
Two automated CodeQL inline comments identified polynomial regex behavior; the
second candidate replaces those scanners and its Security workflow passes.
The code-evolution extraction request is tracked at
https://github.com/link-foundation/code-evolution/issues/1; the implementation
belongs inline in this PR, and the subsequent repository move is explicitly later.

## Requirement inventory

| Requirement                                                        | Implementation plan                                                                                                                    | Verification                                                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| All languages in Hive Mind CI guidance                             | Native JS orchestration with pinned Tree-sitter WASM grammars for JS, TS, Rust, Python, Go, C#, Java, C, C++, PHP and CMake; shell too | Positive/negative parser and abstraction fixtures for each language                   |
| CLI                                                                | Check, languages, rules, doctor, evolution, baseline and server commands; deterministic exit codes                                     | Subprocess tests, installed-package smoke                                             |
| Library                                                            | Typed public analysis, extension, reporting, baseline and evolution APIs                                                               | Direct API and declaration checks                                                     |
| Server + Docker                                                    | Bounded JSON HTTP API, health/capabilities routes and non-root Docker image                                                            | HTTP contract and container smoke                                                     |
| Extensibility                                                      | Custom AST rules, library plugins, explicit trusted command adapters and report imports                                                | Original rule/adapter acceptance tests and failure cases                              |
| Public domain / clean room                                         | Retain Unlicense, use documented contracts and original fixtures, record third-party notices                                           | Provenance ledger and dependency license audit                                        |
| Collect competitors and detailed vision                            | Primary-source feature inventory, implementation evidence and explicit gaps                                                            | Machine-readable capability/readiness inventory                                       |
| Similar or better tests; closed-source documented cases            | Independent behavioral contracts; never copy source or suites; report uncovered capabilities                                           | Capability-to-test mapping, strict parity gate                                        |
| Beat quality-bash fully                                            | Shell syntax/lint/test/coverage/mutation integration, strict report validation, monotonic baseline and methodology fingerprints        | Shell integration cases, boundary and refusal regressions; real tools where available |
| Evolution of files/functions/classes/other abstractions            | Read-only, bounded Git history; syntax identities, renames/deletions, repeated edit patterns, hotspots/coupling and suggestions        | Reproducible temporary Git repositories across languages                              |
| Create extraction issue                                            | Created code-evolution issue 1; keep implementation inline                                                                             | Linked issue and module contract                                                      |
| Deep case study, facts, components, solutions for each requirement | Snapshot issue/language guidance/public quality-bash contracts, research alternatives and tradeoffs                                    | Research ledger, requirement inventory and final evidence                             |
| Single PR, complete scope, verification                            | Preserve existing template behavior; changeset; review complete diff; one coordinator pushes each batch; exact-revision CI             | Focused local checks, CI logs for every failed same-SHA run, clean final tree         |

## Execution checklist

- [x] Read repository guidance, original issue and all comment channels.
- [x] Read language mapping and public quality-bash documentation; pin snapshots.
- [x] Create extraction issue without moving inline implementation.
- [x] Implement the initial native JavaScript behavior and original acceptance cases in bulk.
- [x] Record supported behavior, native adapters and incomplete competitor parity.
- [x] Run focused tests and required static checks on the first candidate revision.
- [x] Review whole diff, commit atomic steps and push the first complete batch once.
- [x] Collect all six first-candidate workflows and preserve all three failure logs.
- [x] Draft combined release metadata, regex and real-tool adapter fixes; preserve original fixture assertions.
- [x] Verify 44 focused tests on Node, Bun and Deno; static checks, types, real tools and isolated release versioning.
- [x] Verify the second exact candidate revision and collect all of its CI results.
- [x] Preserve eight runtime failure logs and the queued macOS Bun capacity cancellation.
- [x] Fix the five reproduced template test assumptions without removing assertions.
- [x] Implement and verify strict atomic baseline persistence, target-revision gates and persistent fresh report bundles.
- [x] Verify and review the third exact candidate, push once and collect all CI results.
- [x] Implement shell migration, file selection, independent check commands, bounded scheduling, raw coverage artifacts and early-stop Bats contracts.
- [x] Verify the reviewed glob dependency patch, registry signatures, bounded regression and frozen npm/Deno graph resolutions.
- [x] Verify and review the fourth exact candidate, push once and collect every CI result.
- [x] Draft pinned amd64/arm64 executable downloads and the consumer Action; validate actual amd64 kcov 43 QA.
- [x] Verify the fifth exact candidate and collect all results, including the reproduced arm64 size failure.
- [x] Implement independent upstream-schema import, preserve floors/source bytes, refuse duplicate JSON keys and verify actual CLI migration.
- [x] Verify the sixth exact candidate, both native architectures and all six workflows.
- [x] Draft pinned private shared-library downloads, retained notices, loader resolution and managed-tree verification.
- [x] Reproduce and fix missing Bash prerequisite, changing toolchains, duplicate coverage/diagnostic JSON and malformed TAP records.
- [x] Verify the seventh exact candidate and both native architectures; collect all same-revision results, five runtime failures and the macOS Bun capacity cancellation.
- [x] Verify downloadable private shared-library dependencies on native amd64 and arm64 at a764ae6.
- [x] Preserve Windows drive-prefix and macOS staging-root failure logs; reproduce and draft portable path fixes without weakening assertions.
- [x] Implement original CMake literal arity, structural complexity, syntax refusals and unsupported-expansion reporting; compare finite scripts against CMake 3.28.3.
- [x] Add CMake evolution and custom-rule refusal, version the methodology and preserve existing-baseline migration requirements.
- [x] Implement tool-free command help/version discovery with original public-contract regressions.
- [x] Verify and review the eighth exact candidate, push once after every seventh-candidate CI result and collect all six passing same-revision workflows.
- [ ] Complete the remaining shell diagnostic inventory.
- [x] Compare the checksum-verified released quality-bash CLI with original source/test fixtures on identical installed tools; retain measured counts, rounding and refusal differences.
- [x] Add original arithmetic mutations, exact floor/explicit half-up rounding, reviewed-baseline method changes, Action settings and command-specific help.
- [x] Verify and review the ninth exact candidate after collecting every eighth-candidate CI result, push once and collect all new CI results; all six workflows pass at 6713d1e after the unacquired macOS job retries.
- [x] Reproduce helper/data changes accepted between controls and mutants; draft bounded full-workspace consistency checks and real Bats refusal evidence.
- [x] Collect all ninth-candidate CI results, verify/review the helper candidate and publish it together with the token-block batch.
- [x] Verify tenth-candidate helper consistency locally at c0afb69: three runtimes, static/types/package/release, twelve real measurements and helper refusal; reproduce comparison evidence byte-for-byte.
- [x] Draft original bounded token-block pairs, normalization, source ranges and CLI/HTTP gates from the stable PMD 7.29.0 public contract; validate finite original cases and a 300-case index oracle.
- [x] After collecting all ninth-candidate CI, verify/review the combined helper/token candidate at 77dedd9 and push the batch once.
- [x] Collect every same-revision workflow result for 77dedd9 before the next push; all six workflows pass.
- [x] Extend the original CMake reader with bounded lexical spans and native token pairs; preserve incomplete syntax/expansion refusals and validate original positive/negative cases.
- [x] Verify/review CMake token candidate 4ac4c97 and push once; 165 Node checks, 149 Bun/frozen-Deno cases, static/types/package/release and twelve source hashes pass.
- [x] Collect every same-revision CI result for 4ac4c97; all six workflows pass, including nine runtime legs and desktop packaging; checks attempt one has no failures.
- [x] Draft original opt-in comment clone regions across thirteen modes, strict marker refusals, segment boundaries and audited JSON/SARIF ranges; preserve syntax and other rules.
- [x] Verify/review the suppression candidate, including CLI/HTTP/package consumers, bounded marker probe and new public-contract provenance; publish together with occurrence groups after every CMake CI result.
- [x] Verify suppression candidate efad61a locally: 189 Node and 173 Bun/frozen-Deno checks, static/types/package/release, 408-file guard and thirteen source hashes; strict readiness still refuses unfinished capabilities.
- [x] Add original occurrence groups derived from verified maximal pairs; preserve pair findings/gates and test all language modes, normalization, ranges, suppression and consumer reports in the same push batch.
- [x] Verify/review combined candidate 556f80c: 209 Node checks, 193 Bun/frozen-Deno cases, static/types/package/release, 410-file guard and fourteen source hashes; push once.
- [x] Collect every same-revision CI result for 556f80c; all six workflows pass on attempt one before the next push.
- [x] Draft optional Java/C# annotation and C# using-directive token filters from the stable public CPD contract; preserve default methods, syntax/other rules, comment markers and work budgets; verify original boundaries and consumer cases.
- [x] Verify/review syntax-filter candidate 76a904f: 227 Node and 211 Bun/frozen-Deno checks, static/types/package/release, 413-file guard and fifteen source hashes; push once.
- [ ] Collect every same-revision CI result for 76a904f before the next push.
- [x] Draft native structural tree patterns with grammar fields/operators, named-child sequences, captures, repeated-capture equality and one bounded sequence wildcard; preserve legacy rules/default methods and refuse unsupported adapters.
- [ ] Verify original positive/negative rules, budgets, typed/CLI/HTTP/package consumers and baseline boundaries; record clean-room contract and remaining Semgrep gaps.
- [ ] Complete remaining language semantics and competitor/proprietary documented cases.
- [ ] Update PR title/body, preserve Fixes #1, mark ready after verification.

"Best on the planet", "all competitors" and "all cases they document" are
open-ended ambitions rather than a finite test oracle. The readiness inventory
must not certify universal superiority from an orchestration interface or a green
test run. Missing semantic/hosted capabilities remain explicit unmet criteria
until independently demonstrated. A strict parity command will fail on those
entries; ordinary analysis reports identify their actual scope.
