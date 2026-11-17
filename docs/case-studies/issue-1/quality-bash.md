# quality-bash documented-contract comparison

Source: public README, baseline schema and development contract at
[`8dc30669aa4255dfc6f84fb0f935b8036081fab4`](https://github.com/ever-guild/quality-bash/tree/8dc30669aa4255dfc6f84fb0f935b8036081fab4),
retrieved 2026-11-17, plus checksum-verified v1.0.0-alpha.5 public CLI help/version
and packaging metadata, paraphrased in [the release contract](data/quality-bash-cli-contract.json).
Its implementation and tests were not inspected. Original
fixtures use public behavior descriptions. External Bash/ShellCheck/Bats/kcov are
executed as separate tools and retain their licenses.

| Documented contract                                                                    | Implemented behavior / evidence                                                                                                                       | Remaining gap                                                                                                     |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Syntax, lint, Bats control, coverage and mutation all required                         | `shellQuality`, injected tests and real Linux Bash 5.2.21 / ShellCheck 0.11.0 / Bats 1.14.0 / kcov 43 acceptance                                      | Other tool/platform combinations remain unverified                                                                |
| Coverage 3/5, mutation 2/3 public measurement example                                  | Injected Codecov JSON/TAP pipeline asserts 60 and 66.66; independent real fixtures measure 75% coverage and 100 / 66.66 mutation                      | Original fixtures, not the upstream real fixture                                                                  |
| Baseline created only after measurement, explicit creation, updates never lower floors | CLI baseline-update --create after passing lint/control; atomic locked writes; monotonic gates                                                        | Audited independent schema import preserves floors; numeric methodology equivalence is not assumed                |
| Every measured source represented; empty/malformed data fail                           | Exact Codecov/source inventory and integer hit counts; LCOV API validates DA/LF/LH; missing TAP fails                                                 | Original refusal audit in docs/shell-diagnostics.md; exhaustive upstream catalog remains unfinished               |
| Timeouts/tool errors are not killed mutants                                            | Bounded subprocess refuses timeout/output budget; complete controls plus strict planned mutant assertion prefixes; exit 1 required for killed mutants | Actual Bats 1.14 assertion/setup/teardown/setup_file abort cases pass; broader diagnostic inventory unfinished    |
| Include semantic execution settings in baseline, exclude scheduling jobs               | Parser/operator/tool versions, executable SHA-256, managed-tree fingerprint, selected tests, stage, rules and timeout hashed                          | Bounded jobs auto or 1–4 supported; no performance equivalence demonstrated                                       |
| Read committed target-branch baseline in CI                                            | --baseline-ref additionally checks a bounded regular Git blob without checkout; nested and literal paths tested                                       | Actual consumer Action and base-SHA refusal tests pass; absent base blobs fail closed                             |
| Reports under quality-reports                                                          | Default persistent fresh run bundles, JSON/text/SARIF/diagnostics, atomic latest manifest, incomplete runs never reuse green results                  | Raw HTML/Cobertura/Codecov artifacts retained within explicit budgets; validated internal kcov alias materialized |
| Pinned checked toolchain downloads, doctor                                             | Doctor inspects versions and managed-tree hashes; checksum-pinned Bats 1.14, ShellCheck 0.11, Debian kcov 43 and private libraries, amd64/arm64       | Host Bash/glibc/Python and dynamic plugins remain explicit dependencies                                           |
| Linux amd64/arm64 acceptance                                                           | Portable JS unit matrix; real Linux CI with both private library closures at a764ae6                                                                  | Other platform/tool combinations and exhaustive documented cases remain unverified                                |
| Help/version discovery without installed tools or a project                            | Original CLI regressions cover all command help, aliases and unknown-command refusal before config lookup                                             | Command-specific detailed help and exhaustive upstream CLI cases remain unfinished                                |
| Symlinks/special/comma coverage paths unsupported                                      | Explicit refusals, isolated owned mutant copies                                                                                                       | Complete upstream path edge-case audit unfinished                                                                 |
| Shell coverage excludes embedded awk/jq/etc                                            | kcov Bash only, explicitly documented                                                                                                                 | No claim to measure embedded-language coverage                                                                    |
| Trusted project execution, no sandbox                                                  | Explicit qa/--tools; HTTP never executes config adapters                                                                                              | Project tests remain trusted code running as current user                                                         |

Full superiority is unfinished. Missing rows are carried in strict readiness and
cannot be certified by the passing structural or mocked integration suites.

The released help also exposes repeatable script/test selection, independent
lint/test/coverage/mutation/baseline-check commands, automatic or explicit worker
counts and an explained baseline migration. These now have original behavioral
regressions in `tests/quality-shell-options.test.js` and
`tests/quality-baseline-io.test.js`. Compatible methods and file inventories never
accept lower floors, even with a migration explanation. Selected source and test
bytes must stay unchanged throughout the measurement. Concurrent mutation workers
are isolated, preserve result order and all finish before an error is returned.

`experiments/code-quality/bats-abort.mjs` executes actual Bats 1.14 assertion,
setup, teardown and setup_file failures with an original two-test plan. The QA
acceptance also exercises two workers, a failing first test, report persistence
and both original 100%/66.66% mutation fixtures. Raw kcov preservation initially
failed on its generated `bats` symlink: the corrected reader validates its direct
internal hash-directory target, materializes the alias and refuses all other
symlinks. Original regression tests cover the valid alias and escape refusals.

The pinned public tool manifest uses Bats 1.14.0, ShellCheck 0.11.0 and kcov 43
for Linux amd64 and arm64. This engine now downloads those executable versions
with independently checked pins, refuses existing installation directories,
retains runtime helpers/licenses and records all installed file hashes. Actual
amd64 acceptance passes nine measurements including consumer-Action QA and an
audited upstream-schema import with kcov 43. Both native architecture jobs pass
at `dbbcce7d424d9e15837d683d93825e943c1af6ab` after the bounded arm64 size
correction. The seventh candidate downloads a separately pinned Debian library
closure, retains notices and checks loader resolution. [Both native architecture
jobs](https://github.com/link-foundation/code-quality/actions/runs/44162751383)
pass at `a764ae634625ad3fafc58e6b0548d19a26aa0de7` with those private libraries.
Managed-tree verification covers helpers and libraries before and
after measurement, with relocatable fingerprints. Host Bash >=5.2, glibc >=2.36,
Python and dynamically loaded plugins remain explicit prerequisites/limits.
See [installation and Action contracts](../../shell-toolchain.md).
The [schema import contract](../../baseline-interchange.md) explicitly requires
fresh independent QA and never lowers imported floors. The [original refusal audit](../../shell-diagnostics.md) maps finite documented
contracts to regression evidence. An exhaustive upstream diagnostic inventory remains unfinished. The strict readiness gate continues to reject parity.
