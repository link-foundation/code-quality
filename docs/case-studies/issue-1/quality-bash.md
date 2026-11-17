# quality-bash documented-contract comparison

Source: public README, baseline schema and development contract at
[`8dc30669aa4255dfc6f84fb0f935b8036081fab4`](https://github.com/ever-guild/quality-bash/tree/8dc30669aa4255dfc6f84fb0f935b8036081fab4),
retrieved 2026-11-17, plus checksum-verified v1.0.0-alpha.5 public CLI help/version
and packaging metadata, paraphrased in [the release contract](data/quality-bash-cli-contract.json).
Its implementation and tests were not inspected. Original
fixtures use public behavior descriptions. External Bash/ShellCheck/Bats/kcov are
executed as separate tools and retain their licenses.

| Documented contract                                                                    | Implemented behavior / evidence                                                                                                                          | Remaining gap                                                                                                     |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Syntax, lint, Bats control, coverage and mutation all required                         | `shellQuality`, injected tests and real Linux Bash 5.2.21 / ShellCheck 0.11.0 / Bats 1.14.0 / kcov 43 acceptance                                         | Other tool/platform combinations remain unverified                                                                |
| Coverage 3/5, mutation 2/3 public measurement example                                  | Injected Codecov JSON/TAP pipeline asserts 60 and 66.66; independent real fixtures measure 75% coverage and 100 / 66.66 mutation                         | Original fixtures, not the upstream real fixture                                                                  |
| Baseline created only after measurement, explicit creation, updates never lower floors | CLI baseline-update --create after passing lint/control; atomic locked writes; monotonic gates                                                           | Different versioned baseline schema; audited incompatible migration supported, upstream schema import absent      |
| Every measured source represented; empty/malformed data fail                           | Exact Codecov/source inventory and integer hit counts; LCOV API validates DA/LF/LH; missing TAP fails                                                    | Full upstream diagnostic case inventory not replicated                                                            |
| Timeouts/tool errors are not killed mutants                                            | Bounded subprocess refuses timeout/output budget; complete controls plus strict planned mutant assertion prefixes; exit 1 required for killed mutants    | Actual Bats 1.14 assertion/setup/teardown/setup_file abort cases pass; broader diagnostic inventory unfinished    |
| Include semantic execution settings in baseline, exclude scheduling jobs               | Parser/operator/tool versions, executable SHA-256, selected test inventory, stage, native rules and timeout hashed                                       | Bounded jobs auto or 1–4 supported; no performance equivalence demonstrated                                       |
| Read committed target-branch baseline in CI                                            | --baseline-ref additionally checks a bounded regular Git blob without checkout; nested and literal paths tested                                          | Consumer Action selects the exact PR base SHA; full CI validation pending                                         |
| Reports under quality-reports                                                          | Default persistent fresh run bundles, JSON/text/SARIF/diagnostics, atomic latest manifest, incomplete runs never reuse green results                     | Raw HTML/Cobertura/Codecov artifacts retained within explicit budgets; validated internal kcov alias materialized |
| Pinned checked toolchain downloads, doctor                                             | Doctor inspects installed versions and hashes executable bytes; Checksum-pinned downloads for Bats 1.14, ShellCheck 0.11 and Debian kcov 43, amd64/arm64 | Host shared libraries remain prerequisites; native arm64 acceptance pending                                       |
| Linux amd64/arm64 acceptance                                                           | Portable JS unit matrix; real Linux CI                                                                                                                   | Native Ubuntu 24.04 arm64 QA job added; result pending                                                            |
| Symlinks/special/comma coverage paths unsupported                                      | Explicit refusals, isolated owned mutant copies                                                                                                          | Complete upstream path edge-case audit unfinished                                                                 |
| Shell coverage excludes embedded awk/jq/etc                                            | kcov Bash only, explicitly documented                                                                                                                    | No claim to measure embedded-language coverage                                                                    |
| Trusted project execution, no sandbox                                                  | Explicit qa/--tools; HTTP never executes config adapters                                                                                                 | Project tests remain trusted code running as current user                                                         |

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
amd64 acceptance passes eight measurements including consumer-Action QA with
kcov 43. Native arm64 CI is configured but not yet observed. Host glibc/Python
and shared libraries remain prerequisites; fully bundled dependencies are
unfinished. See [installation and Action contracts](../../shell-toolchain.md).
Upstream-schema import and the complete upstream documented diagnostic inventory
also remain unverified. The strict readiness gate continues to reject parity.
