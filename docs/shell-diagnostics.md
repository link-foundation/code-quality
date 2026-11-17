# Shell refusal and evidence audit

This audit maps the pinned public quality-bash README, development guide,
baseline schema and released CLI help to independent cases. The original
fixtures and implementations are in this repository. Upstream implementation
and test source were not read. See the [contract comparison](case-studies/issue-1/quality-bash.md)
for remaining parity limits.

| Contract                                                                                                                                  | Independent evidence                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Valid literal/variable/Unicode patterns, case labels and heredocs parse; corrupt shipped grammar refuses                                  | `tests/quality-bash-grammar.test.js`, `docs/bash-parser.md`                                              |
| GNU Bash >=5.2; refuse unknown/older versions before project execution or downloads                                                       | `tests/quality-shell-version.test.js`                                                                    |
| Checksum failure never reaches extraction; existing user directories survive failures                                                     | `tests/quality-toolchain.test.js`                                                                        |
| Tools include helpers, private libraries and notices; reject dependency fallback outside the private tree except glibc                    | `tests/quality-runtime.test.js`, actual installer and native-architecture CI                             |
| Tool identity includes managed libraries/helpers; changes during measurement fail                                                         | `tests/quality-runtime.test.js`, `tests/quality-shell-version.test.js`                                   |
| Source syntax and lint must pass before creating a baseline                                                                               | `experiments/code-quality/real-shell.mjs` preserves the original baseline after actual ShellCheck SC2034 |
| Failed controls, missing tests, malformed coverage and partial mutant budgets fail                                                        | `tests/quality-shell.test.js`                                                                            |
| Every selected source must have coverage; missing/unexpected source records fail                                                          | Exact inventory comparison in `shell.js`; original fixture pipeline in `tests/quality-shell.test.js`     |
| Coverage counters must be nonnegative safe integers; missing/empty measurements fail                                                      | `tests/quality-shell.test.js`, `tests/quality-integration.test.js`                                       |
| Duplicate JSON keys cannot replace coverage hits, diagnostic severity or baseline floors                                                  | `tests/quality-shell-diagnostics.test.js`, `tests/quality-json.test.js`                                  |
| Bats assertion/setup/teardown/setup_file failure stops a mutant at the first failure                                                      | `experiments/code-quality/bats-abort.mjs`, actual Bats 1.14                                              |
| An aborted mutant needs the original plan and a sequential failure prefix                                                                 | `tests/quality-shell-options.test.js`                                                                    |
| Unknown TAP records, duplicate/misplaced headers, invalid numbers, skipped/TODO tests and bailouts fail                                   | `tests/quality-shell-diagnostics.test.js`, `tests/quality-shell-options.test.js`                         |
| Infrastructure exit codes, execution deadlines and output limits never count as killed mutants                                            | `tests/quality-shell-options.test.js`, `tests/quality-integration.test.js`                               |
| Worker failure waits for active workers; originals remain unchanged                                                                       | `tests/quality-shell-options.test.js`                                                                    |
| Selected test/source inventory is exact and unchanged; jobs do not alter the method                                                       | `tests/quality-shell-options.test.js`                                                                    |
| Coverage and mutation floors never decrease under compatible methodology                                                                  | `tests/quality-baseline-io.test.js`, actual CLI QA                                                       |
| An incompatible migration requires an explanation and fresh complete measurements                                                         | `tests/quality-baseline-io.test.js`, actual CLI QA                                                       |
| A foreign-schema import keeps its source and floors and only creates a new destination                                                    | `tests/quality-baseline-import.test.js`, actual CLI QA                                                   |
| A PR must also satisfy the committed target baseline; invalid/missing Git blobs fail                                                      | `tests/quality-baseline-io.test.js`, `tests/quality-action.test.js`                                      |
| Failed measurement writes new incomplete evidence and preserves earlier bundles                                                           | `tests/quality-baseline-io.test.js`, `tests/quality-action.test.js`                                      |
| Raw HTML, Cobertura and Codecov outputs are bounded; unapproved links fail                                                                | `tests/quality-baseline-io.test.js`, actual CLI QA                                                       |
| Arithmetic operators, exact default floor and explicit half-up rounding are fingerprinted                                                 | `tests/quality-shell-arithmetic.test.js`, original released-CLI comparison                               |
| Command help gives relevant options before project/tool lookup                                                                            | `tests/quality-cli-help.test.js`                                                                         |
| Helpers, data, unselected inputs and their permissions remain unchanged across stages; copy exclusions cannot hide selected tests/sources | `tests/quality-shell-workspace.test.js`, actual Bats helper-change refusal                               |

`parseTap` accepts the Bats numbered TAP stream, comments and an optional first
`TAP version 13` record. Arbitrary TAP extensions such as YAML diagnostics are
unsupported. Coverage measures Bash, including kcov's documented byte-identical
file limitation; it does not measure embedded awk/jq programs. Symlinks, special
workspace files and comma-containing coverage paths are refused.

This is a finite regression inventory, not an exhaustive upstream diagnostic
catalog or a proof of numeric methodology equivalence. Native metrics round
down to two decimals by default; explicit half-up mode matches the released
rounding policy and remains fingerprinted. The [original real-tool comparison](shell-measurements.md)
retains raw counts and operator differences. Full
quality-bash parity remains partial in the strict readiness inventory. Host
glibc, Python, dynamically loaded plugins and system configuration are outside
the managed-library fingerprint. Tool checks detect changes between the two
observations; trusted project code is not sandboxed against deliberate races.
The [workspace input contract](shell-inputs.md) records bounded helper/data
fingerprints and their exclusions, including files outside the observed tree.
