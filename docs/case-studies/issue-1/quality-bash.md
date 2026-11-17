# quality-bash documented-contract comparison

Source: public README, baseline schema and development contract at
[`8dc30669aa4255dfc6f84fb0f935b8036081fab4`](https://github.com/ever-guild/quality-bash/tree/8dc30669aa4255dfc6f84fb0f935b8036081fab4),
retrieved 2026-11-17, plus checksum-verified v1.0.0-alpha.5 public CLI help/version
and packaging metadata, paraphrased in [the release contract](data/quality-bash-cli-contract.json).
Its implementation and tests were not inspected. Original
fixtures use public behavior descriptions. External Bash/ShellCheck/Bats/kcov are
executed as separate tools and retain their licenses.

| Documented contract                                                                    | Implemented behavior / evidence                                                                                                      | Remaining gap                                                                                    |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Syntax, lint, Bats control, coverage and mutation all required                         | `shellQuality`, injected tests and real Linux Bash 5.2.21 / ShellCheck 0.11.0 / Bats 1.2.1 / kcov 42 acceptance                      | Other tool/platform combinations remain unverified                                               |
| Coverage 3/5, mutation 2/3 public measurement example                                  | Injected Codecov JSON/TAP pipeline asserts 60 and 66.66; independent real fixtures measure 75% coverage and 100 / 66.66 mutation     | Original fixtures, not the upstream real fixture                                                 |
| Baseline created only after measurement, explicit creation, updates never lower floors | CLI baseline-update --create after passing lint/control; atomic locked writes; monotonic gates                                       | Different versioned baseline schema; no upstream import/migration                                |
| Every measured source represented; empty/malformed data fail                           | Exact Codecov/source inventory and integer hit counts; LCOV API validates DA/LF/LH; missing TAP fails                                | Full upstream diagnostic case inventory not replicated                                           |
| Timeouts/tool errors are not killed mutants                                            | Bounded subprocess refuses timeout/output budget; completed TAP required                                                             | All setup/teardown/early-stop Bats semantics not replicated; this engine requires complete tests |
| Include semantic execution settings in baseline, exclude scheduling jobs               | Parser/operator/tool versions, executable SHA-256, native rules and timeout hashed                                                   | No configurable parallel jobs; no performance equivalence demonstrated                           |
| Read committed target-branch baseline in CI                                            | --baseline-ref additionally checks a bounded regular Git blob without checkout; nested and literal paths tested                      | Automatic PR-base selection/Action absent                                                        |
| Reports under quality-reports                                                          | Default persistent fresh run bundles, JSON/text/SARIF/diagnostics, atomic latest manifest, incomplete runs never reuse green results | Raw kcov HTML/Cobertura preservation absent                                                      |
| Pinned checked toolchain downloads, doctor                                             | Doctor inspects installed versions and hashes executable bytes; CI checksums upstream kcov 42 amd64                                  | Full downloadable amd64/arm64 distribution absent                                                |
| Linux amd64/arm64 acceptance                                                           | Portable JS unit matrix; real Linux CI                                                                                               | Real native arm64 full acceptance not established                                                |
| Symlinks/special/comma coverage paths unsupported                                      | Explicit refusals, isolated owned mutant copies                                                                                      | Complete upstream path edge-case audit unfinished                                                |
| Shell coverage excludes embedded awk/jq/etc                                            | kcov Bash only, explicitly documented                                                                                                | No claim to measure embedded-language coverage                                                   |
| Trusted project execution, no sandbox                                                  | Explicit qa/--tools; HTTP never executes config adapters                                                                             | Project tests remain trusted code running as current user                                        |

Full superiority is unfinished. Missing rows are carried in strict readiness and
cannot be certified by the passing structural or mocked integration suites.

The released help additionally exposes repeatable script/test selection,
independent lint/test/coverage/mutation/baseline-check commands, automatic or
explicit worker counts and a baseline migration explanation. These remain
unimplemented contracts; a different CLI spelling alone would not be a behavior
gap. The pinned public tool manifest uses Bats 1.14.0, ShellCheck 0.11.0 and kcov 43
for Linux amd64 and arm64; this engine's real acceptance currently uses Bats 1.2.1
and kcov 42 on amd64. Merely hashing installed entry executables does not verify
all transitive shell helpers or shared libraries.
