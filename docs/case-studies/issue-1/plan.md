# Issue 1 implementation and verification plan

PR: https://github.com/link-foundation/code-quality/pull/2

The issue and all three PR discussion channels were read on 2026-11-17.
There are no issue comments, PR comments/reviews, or required sub-issues.
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
- [ ] Verify the next exact candidate revision and collect all of its CI results.
- [ ] Update PR title/body, preserve Fixes #1, mark ready after verification.

"Best on the planet", "all competitors" and "all cases they document" are
open-ended ambitions rather than a finite test oracle. The readiness inventory
must not certify universal superiority from an orchestration interface or a green
test run. Missing semantic/hosted capabilities remain explicit unmet criteria
until independently demonstrated. A strict parity command will fail on those
entries; ordinary analysis reports identify their actual scope.
