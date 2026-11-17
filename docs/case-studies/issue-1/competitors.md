# Competitor and documented capability inventory

Research date 2026-11-17. This is an extensible discovery inventory, not an exhaustive
list of every current product. Product claims below are concise paraphrases from
primary documentation, not measured comparative accuracy or speed results.
Open-core/commercial products are assessed by public contracts only. No proprietary
source, competitor implementation, or competitor test suite is incorporated.

## Reviewed public contracts

| Product / primary source                                                                                          | Public capability families                                                | This implementation and unverified gap                                                                        |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [SonarQube Cloud/Server](https://www.sonarsource.com/products/sonarqube/)                                         | Structural/security rules, quality gates, taint, secrets, SCA, governance | Basic structural rules/gates native; deep taint, dependency intelligence and governance missing               |
| [JetBrains Qodana](https://www.jetbrains.com/help/qodana/features.html)                                           | IDE inspections, baseline, coverage, quick fixes, taint, dashboards       | Baseline/import native; IDE semantic inspections, fixes and hosted services missing                           |
| [Semgrep](https://docs.semgrep.dev/writing-rules/rule-syntax)                                                     | Structural patterns, metavariables, taint rules, matching operators       | Simple AST literal/kind rules native; DSL/metavariables/taint missing                                         |
| [GitHub CodeQL/code scanning](https://docs.github.com/en/code-security/concepts/code-scanning/code-scanning)      | Database queries, security paths, SARIF alerts                            | SARIF import/export native; CodeQL query engine/database/alert hosting missing                                |
| [Snyk Code](https://docs.snyk.io/scan-fix-and-prevent/scan-with-snyk/snyk-code)                                   | Interfile SAST and suggested fixes                                        | Heuristic risky eval detection only; dataflow and fix validation missing                                      |
| [CodeScene](https://helpcenter.codescene.com/en/help/articles/1844075-how-to-assess-coupling-health-in-codescene) | Hotspots, coupling, Code Health and prioritization                        | Observed file hotspots/coupling native; proprietary Code Health and organization analysis missing             |
| [Codacy](https://docs.codacy.com/)                                                                                | Aggregated quality/security/coverage and organization policies            | Reports and thresholds native; hosted policies/workflows missing                                              |
| [Qlty / Code Climate Quality](https://docs.qlty.sh/what-is-qlty)                                                  | Multi-tool lint, formatting, complexity, duplication, coverage            | Structural subset and adapters native; complete rule/fix/catalog parity missing                               |
| [DeepSource](https://docs.deepsource.com/docs/platform/getting-started)                                           | Analyzers, coverage, autofix and repository integrations                  | Adapters and coverage measurements native; analyzer inventory/autofix/hosted integrations missing             |
| [Ruff](https://docs.astral.sh/ruff/rules/)                                                                        | Python lint rules and automatic fixes                                     | Ruff output adapter; native Python rule/fix suite missing                                                     |
| [PMD/CPD 7.29.0](https://docs.pmd-code.org/pmd-doc-7.29.0/pmd_userdocs_cpd.html)                                  | Multilanguage lint and token duplication                                  | Native whole-function and optional token-block pairs; complete rules/lexer/options/grouping parity unverified |
| [Stryker](https://stryker-mutator.io/docs/stryker-js/configuration/)                                              | Mutation operators, thresholds, concurrency and reports                   | Original shell mutations/floors; JS/.NET/JVM mutation and complete operator parity missing                    |
| [quality-bash](https://github.com/ever-guild/quality-bash)                                                        | Shell syntax/lint/Bats/kcov/mutations and strict baseline                 | Pipeline subset native JS, tools external; full parity explicitly incomplete                                  |

## Broader discovery queue

These primary project references identify relevant specialist and commercial
alternatives. Their complete current rule catalogs and documented cases have **not**
been audited or replicated. Listing an adapter recipe is not equivalent to passing
an analyzer's documented acceptance cases. Every row therefore retains an incomplete
parity status in the required `competitor-parity` capability.

| Project                                                                                          | Relevant area                      | Parity status            |
| ------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------ |
| [ESLint](https://eslint.org/docs/latest/)                                                        | JS plugin lint                     | Unverified native parity |
| [Biome](https://biomejs.dev/)                                                                    | JS formatter/linter                | Unverified native parity |
| [typescript-eslint](https://typescript-eslint.io/)                                               | Typed JS lint                      | Unverified native parity |
| [TypeScript](https://www.typescriptlang.org/docs/)                                               | Compiler semantics                 | Unverified native parity |
| [Pylint](https://pylint.readthedocs.io/)                                                         | Python lint                        | Unverified native parity |
| [mypy](https://mypy.readthedocs.io/)                                                             | Python types                       | Unverified native parity |
| [Pyright](https://github.com/microsoft/pyright)                                                  | Python types                       | Unverified native parity |
| [Bandit](https://bandit.readthedocs.io/)                                                         | Python security                    | Unverified native parity |
| [Clippy](https://doc.rust-lang.org/clippy/)                                                      | Rust lint                          | Unverified native parity |
| [golangci-lint](https://golangci-lint.run/)                                                      | Go lint aggregator                 | Unverified native parity |
| [Staticcheck](https://staticcheck.dev/)                                                          | Go analysis                        | Unverified native parity |
| [Roslyn analyzers](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/overview) | C# analyzer API                    | Unverified native parity |
| [Checkstyle](https://checkstyle.org/)                                                            | Java style                         | Unverified native parity |
| [SpotBugs](https://spotbugs.github.io/)                                                          | Java bug patterns                  | Unverified native parity |
| [Error Prone](https://errorprone.info/)                                                          | Java compiler checks               | Unverified native parity |
| [clang-tidy](https://clang.llvm.org/extra/clang-tidy/)                                           | C/C++ checks                       | Unverified native parity |
| [Cppcheck](https://cppcheck.sourceforge.io/)                                                     | C/C++ analysis                     | Unverified native parity |
| [PHPStan](https://phpstan.org/)                                                                  | PHP type analysis                  | Unverified native parity |
| [Psalm](https://psalm.dev/)                                                                      | PHP analysis                       | Unverified native parity |
| [PHP_CodeSniffer](https://github.com/PHPCSStandards/PHP_CodeSniffer)                             | PHP style                          | Unverified native parity |
| [ShellCheck](https://www.shellcheck.net/)                                                        | Shell diagnostics                  | Unverified native parity |
| [shfmt](https://github.com/mvdan/sh)                                                             | Shell format                       | Unverified native parity |
| [Bats](https://bats-core.readthedocs.io/)                                                        | Shell testing                      | Unverified native parity |
| [kcov](https://simonkagstrom.github.io/kcov/)                                                    | Coverage measurement               | Unverified native parity |
| [cmake-lint](https://cmake-format.readthedocs.io/en/latest/cmake-lint.html)                      | CMake lint                         | Unverified native parity |
| [jscpd](https://github.com/kucherenko/jscpd)                                                     | Token duplication                  | Unverified native parity |
| [Gitleaks](https://github.com/gitleaks/gitleaks)                                                 | Secret detection                   | Unverified native parity |
| [Trivy](https://trivy.dev/)                                                                      | Dependencies/containers/IaC        | Unverified native parity |
| [Checkov](https://www.checkov.io/)                                                               | IaC scanning                       | Unverified native parity |
| [Infer](https://fbinfer.com/)                                                                    | Interprocedural analysis           | Unverified native parity |
| [PVS-Studio](https://pvs-studio.com/)                                                            | Commercial static analysis         | Unverified native parity |
| [Coverity](https://www.blackduck.com/static-analysis-tools-sast/coverity.html)                   | Commercial SAST                    | Unverified native parity |
| [Polyspace](https://www.mathworks.com/products/polyspace.html)                                   | Commercial formal/static analysis  | Unverified native parity |
| [Parasoft](https://www.parasoft.com/)                                                            | Commercial testing/static analysis | Unverified native parity |
| [Klocwork](https://www.perforce.com/products/klocwork)                                           | Commercial SAST                    | Unverified native parity |

## Independent contract families

The original tests cover syntax success/refusal in each target language, exact rule
thresholds, structural duplication, literal/kind extensions, output determinism,
SARIF locations, complete TAP/LCOV, baseline non-weakening, failed subprocesses,
API input/refusal and Git edit evidence. None is claimed to be a copy or exhaustive
replacement of another product's tests. Specialized compiler/dataflow/framework
cases, autofix correctness, recall/precision benchmarks, organization dashboards,
SSO/RBAC, audit/compliance exports, IDE plugins, dependency databases and high-scale
incremental analysis remain missing. Implementing and independently validating
those cases is necessary before the requested universal superiority claim can pass.

A defensible comparison requires a versioned rule/case manifest for each product,
original positive/negative fixtures with expected locations and refusal behavior,
locked tool versions, equivalent configurations, real execution on identical input,
and measured correctness/resource results. Schema compatibility and matched test
counts are insufficient evidence. No performance superiority claim is made here.

## Original token-block contracts

The PMD 7.29.0 public CPD contract was reviewed separately from its implementation
and tests. The [original contract notes](data/pmd-cpd-contract.json) pin the stable
release and document which options remain unverified. Native
[token-block analysis](../../token-clones.md) now covers minimum lengths,
exact-token defaults, optional identifier/literal normalization, same-file repeats,
cross-file locations, finite work refusal and language separation. Original
positive/negative fixtures cover all thirteen modes, including native CMake
command/argument tokens; an independent
finite all-pairs oracle checks 300 index comparisons. CLI, HTTP, SARIF, method
changes and installed-package checks exercise the same implementation.

Opt-in native comment regions recognize marker words in actual comments across
all thirteen modes, retain audited ranges and refuse malformed marker sequences.
The [original suppression contract](data/pmd-suppression-contract.json) records
native policies and tests. Ignored regions cannot join surrounding matches or
disable syntax/structural rules. A finite marker probe and shared token budgets
bound work even for ignored code.

The stable public report-format overview describes multiple locations for a
duplicate. The [original group contract](data/pmd-group-contract.json) records
the native view: deduplicate locations within each verified pair signature,
language and token count, retaining all pair findings and gates. Original cases
cover three-copy blocks in thirteen modes, normalization, overlapping group
ranges, comment regions, CLI/HTTP/package consumers and JSON/text/SARIF evidence.

Optional native Java/C# annotation and C# using-directive filters now cover the
corresponding documented option families. The
[original syntax-filter contract](data/pmd-syntax-filter-contract.json) records
scopes, retained ranges, method migrations and refusal budgets. Annotation type
declarations, ordinary brackets, using statements, local using declarations and
other languages remain visible. Syntax/custom rules and comment markers still
inspect omitted constructs. A regression also reproduces and corrects Java's
previously unrecognized numeric literal kinds; exact comparisons remain unchanged.

This does not establish equivalent lexers, language-specific normalization,
legacy annotation suppression, equivalent grouping, or complete PMD/CPD rule and case parity.
The strict readiness inventory continues to reject universal competitor parity.
