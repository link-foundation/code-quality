# Bash runtime alias CI investigation

Candidate: `2ed679803f0e5bb42fcb243bf81d44f023cf6c5e`, pushed 2026-11-17.
All six workflows were created at 23:42:28 UTC, after the candidate commit.
Five workflows pass: Quality engine, Security, Workflows, Broken Link Checker
and Example app. [Checks and release run 44201704109](https://github.com/link-foundation/code-quality/actions/runs/44201704109)
fails on all nine runtime jobs; its Pipeline Status correctly propagates that
failure. No runner-capacity cancellation was needed.

The full workflow log is preserved locally as `ci-logs/checks-44201704109.log`.
Every failed job also has its own unmodified downloaded log, named
`ci-logs/checks-2ed6798-<job-id>.log`. These generated logs are intentionally
ignored by Git; stable job links and exact line references follow. Files over
1500 lines were inspected through bounded excerpts around each failure.

| Runtime job     | Job ID                                                                                                    | Error line in its individual log |
| --------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Ubuntu Node     | [134458138051](https://github.com/link-foundation/code-quality/actions/runs/44201704109/job/134458138051) | 2504                             |
| Ubuntu Bun      | [134458138313](https://github.com/link-foundation/code-quality/actions/runs/44201704109/job/134458138313) | 1373                             |
| Ubuntu Deno     | [134458138290](https://github.com/link-foundation/code-quality/actions/runs/44201704109/job/134458138290) | 2440                             |
| Windows Node    | [134458138165](https://github.com/link-foundation/code-quality/actions/runs/44201704109/job/134458138165) | 2492                             |
| Windows Bun     | [134458138211](https://github.com/link-foundation/code-quality/actions/runs/44201704109/job/134458138211) | 764                              |
| Windows Deno    | [134458138114](https://github.com/link-foundation/code-quality/actions/runs/44201704109/job/134458138114) | 2416                             |
| macOS Node      | [134458138234](https://github.com/link-foundation/code-quality/actions/runs/44201704109/job/134458138234) | 2482                             |
| macOS Bun       | [134458138135](https://github.com/link-foundation/code-quality/actions/runs/44201704109/job/134458138135) | 2058                             |
| macOS Deno      | [134458138255](https://github.com/link-foundation/code-quality/actions/runs/44201704109/job/134458138255) | 2402                             |
| Pipeline Status | [134463495941](https://github.com/link-foundation/code-quality/actions/runs/44201704109/job/134463495941) | 261: Failing jobs: test          |

Every runtime reports the same single failed test:
`keeps Deno workspace dependency ranges synchronized with package.json`, in
`tests/issue-228-regressions.test.js`, preceding line 81. The guard constructs
`npm:web-tree-sitter-bash-runtime@npm:web-tree-sitter@0.24.7` from the new npm alias.
Deno's frozen graph actually records the target specifier
`npm:web-tree-sitter@0.24.7`. Both runtime versions remain separately pinned.
Parser tests and the full Quality engine workflow pass; this is an incorrect
expected-specifier calculation in the repository guard.

Reproduction before correction:

```sh
node --test --test-name-pattern='keeps Deno workspace dependency ranges' tests/issue-228-regressions.test.js
```

That single check fails locally with the identical expected/actual arrays. The
correction retains an alias's npm target specifier and applies the existing
pre-1.0 caret normalization to its version. Original strict whole-list equality
and every-specifier-present assertions remain. An added finite case covers direct
ranges, exact aliases and scoped aliases. No lock, production dependency version,
audit threshold or acceptance assertion is removed. The corrected guard runs
alongside the new shell policy regressions under Node, Bun and frozen Deno; exact
candidate validation and next-head CI are tracked in the implementation plan.
