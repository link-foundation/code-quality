# Issue 1: a public-domain quality and evolution engine

Research date: 2026-11-17. Implementation: [PR 2](https://github.com/link-foundation/code-quality/pull/2).
The [original request](https://github.com/link-foundation/code-quality/issues/1) has no
comments or required child issues at the time of investigation. The requested later
extraction has its own [code-evolution issue](https://github.com/link-foundation/code-evolution/issues/1).
It is a follow-up move, not a substitute for the inline implementation here.

## Vision and acceptance

Give a developer one local, inspectable report combining structural quality,
explicitly selected specialized analyzers, and evidence from their own Git history.
Keep source private by default, make command execution explicit, preserve raw
measurement evidence, and refuse incomplete checks. Own source and original tests
remain Unlicense. External tools retain their own licenses.

The finite implementation adds a usable CLI, typed library, HTTP server, Docker
image, parser inventory, structural rules, SARIF, baselines, external adapters and
inline history mining. It does **not** establish the issue's universal superiority
criterion. A small set of structural heuristics cannot replace compiler semantics,
cross-file taint analysis, every proprietary documented rule, or enterprise services.
These are explicit unfinished acceptance criteria, recorded in
[readiness.json](readiness.json). `npm run quality:readiness` deliberately exits 1
until every required capability is implemented with evidence. Ordinary product CI
checks functionality and validates that this strict refusal cannot turn green by
omitting a required entry. No production Rust jobs are introduced.

## Design choices and alternatives

| Component        | Alternatives considered                                                | Choice and consequence                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language parsing | Compiler subprocesses, native ast-grep/NAPI, Tree-sitter WASM, regex   | Pinned grammar-specific WASM runtimes run without native compilation on all three JS runtimes. Syntax trees do not supply type resolution. Old grammar snapshots can reject newer syntax.         |
| CMake            | Execute CMake, cmake-lint, general regex                               | Original native command/bracket/block adapter with literal arity and structural decisions; expanded headers refuse incomplete metrics. CMake execution can run project code; it is not automatic. |
| Rules            | Semgrep DSL, ESLint plugin, custom code evaluation                     | Declarative AST-kind/literal and bounded named-tree/capture/sequence rules plus versioned library plugins. Arbitrary regex and config code are not executed. No Semgrep DSL compatibility claim.  |
| Reports          | Proprietary database, SARIF, JSON only                                 | Deterministic JSON/text and SARIF 2.1.0 with stable occurrence fingerprints. No hosted dashboard or SARIF consumer certification.                                                                 |
| Git mining       | PyDriller, GitPython, git log only, custom diff parser                 | Git plumbing plus syntax snapshots; no checkout/worktree writes. Unique identity matches across revisions, repeated normalized before/after edits, file hotspots and temporal coupling.           |
| API              | Express/Fastify, raw HTTP                                              | Node HTTP with bounded bodies/concurrency, startup-only workspace and optional constant-time bearer auth. No database/multitenancy.                                                               |
| Shell QA         | Reimplement ShellCheck/Bats/kcov, copy quality-bash, explicit adapters | Execute independently installed trusted tools and validate their outputs. Mutation operators and baseline logic are original JS. No quality-bash implementation or test source was read.          |
| Packaging        | Rust binary, native addon, portable JS                                 | npm library and CLI plus non-root Node container. Source package stays small; grammar data is a separate pinned dependency.                                                                       |

## Language coverage

The pinned [Hive Mind guidance](data/ci-cd-best-practices.md) names JavaScript,
TypeScript, Rust, Python, Go, C#, Java, C, C++, PHP, and CMake. Every entry has an
independent positive syntax/function fixture and a malformed fixture in
`tests/fixtures/quality-languages.js`; Bash and TSX are included too. Files, functions,
methods, classes, structs, traits, interfaces, namespaces and CMake macros are
represented where the corresponding grammar provides them. Lambdas use anonymous
names; ambiguous identities are never silently carried across revisions.

Coverage here means parsing, abstraction extraction and common structural checks.
Compiler diagnostics, language-standard completeness, project resolution, templates,
preprocessor evaluation and every language-specific lint rule remain outside the
native implementation. `toolRecipes` lists optional integration starting points;
only importing/executing a tool's findings is implemented, not that tool's semantics.
Recipes depend on the separately installed tool version and project configuration.

## Reproducible evidence

| Behavior                                                                                     | Evidence                                                                                                                    |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Every required language, positive/negative syntax, limits, locations                         | `tests/quality-core.test.js` and `tests/fixtures/quality-languages.js`                                                      |
| Original AST/security/duplicate rules and versioned plugins                                  | `tests/quality-core.test.js`                                                                                                |
| Public TypeScript declarations, both package entry points and legacy numeric API             | `tests/types/quality.ts`, `npm run test:types`, Quality engine CI                                                           |
| CLI exit status, exclusions, symlink refusal, report imports, subprocess refusal             | `tests/quality-integration.test.js`                                                                                         |
| HTTP authentication, source analysis, malformed/oversized input, workspace restrictions      | `tests/quality-integration.test.js`                                                                                         |
| Shell pipeline 3/5 coverage, 2/3 killed mutants and no weakening                             | `tests/quality-shell.test.js` uses explicitly injected deterministic tool outputs; it is not a real-tool performance result |
| Real shell syntax/lint/Bats/kcov/mutation                                                    | `experiments/code-quality/real-shell.mjs` and Quality engine CI; failures remain failures                                   |
| Real Git history, file/function/class edits, renames/deletes, repeated patterns, suggestions | `tests/quality-evolution.test.js`, temporary repository, four actual commits                                                |
| Package and container contracts                                                              | existing package tests; `experiments/code-quality/package-smoke.mjs`; Quality engine CI container health/analyze smoke      |
| Strict inventory refusal                                                                     | `tests/quality-readiness.test.js`; missing/partial/carried records are rejected                                             |
| CMake syntax, literal arity, decisions and unsupported-header/custom-rule refusal            | `tests/quality-cmake.test.js`, evolution regressions and original CMake CLI observations                                    |
| Help/version without project configuration or tools                                          | `tests/quality-cli-help.test.js`                                                                                            |

## First candidate CI investigation

All six workflows at `87e5bf203f35a4edb0e65465ec69b4686d77b8ac` were collected
before the next fix batch. The container API, installed package, read-only Git
evolution, browser/desktop builds, workflow audit and link checks passed. Three
failures were preserved locally in `ci-logs/`:

- [Checks and release](https://github.com/link-foundation/code-quality/actions/runs/44127637166):
  log line 1147 reports an old template package name in `ci-audit-coverage`.
  Retarget every pending fragment without changing its notes or bump type; verify
  all headers and run actual release versioning in an isolated metadata copy.
- [Security](https://github.com/link-foundation/code-quality/actions/runs/44127637054):
  log lines 3017–3019 identify two `js/polynomial-redos` findings. The downloaded
  SARIF points to CMake tokenization and trailing-whitespace matching. Original
  finite 256 KiB probes run in memory-limited Node children with a five-second
  budget. The old CMake implementation times out; the scanners finish.
- [Quality engine](https://github.com/link-foundation/code-quality/actions/runs/44127637347):
  log line 875 reports a kcov timeout. Bounded probes reproduce recursive system
  script scanning despite `--include-path`; `--bash-dont-parse-binary-dir` avoids
  it. Further real-tool validation exposed two additional adapter assumptions:
  kcov 38 suppresses the TAP stream, and kcov 42 emits Codecov JSON rather than
  LCOV. Pin/checksum upstream kcov 42, validate executable-line hit counts from
  its canonical report, and preserve the complete TAP/source-inventory checks.

`CODE_QUALITY_DEBUG=1` enables bounded argv/output/duration diagnostics; ordinary
runs keep tracing off. The original real fixture retains its output and implicit
exit-status assertions and kills all three mutants. A second original fixture
uses Bats' `run` helper to inspect output without asserting exit status, so its
return-value mutant deliberately survives and the score is 66.66.

## Second candidate CI investigation

All workflows at `9b8dfda57a1ef46e052cb7a13165a8f924831eff` completed before
the third fix batch. [Quality engine](https://github.com/link-foundation/code-quality/actions/runs/44131475831)
passed actual shell measurements, installed-package imports and the non-root
container with read-only Git history. [Security](https://github.com/link-foundation/code-quality/actions/runs/44131476230)
passed both CodeQL languages; workflow, link and example-app checks passed too.

[Checks and release](https://github.com/link-foundation/code-quality/actions/runs/44131476038)
failed in all eight acquired runtime jobs with the same five test assumptions.
For example, `ci-logs/runtime-134210911097.log` lines 2071–2075 expect no Dockerfile
in the working repository; lines 2089, 2100, 2109 and 2118 expect the old template
package name in OIDC URLs and diagnostics. The local two-file reproduction also
reports exactly five failures. Use an isolated empty Docker fixture, additionally
assert that the shipped Dockerfile enables the build, and derive package-name
expectations from the actual package metadata. Preserve the URL, status, bootstrap,
maintainer guidance and no-secret assertions.

The ninth job, macOS Bun, executed no steps and has no log. Its check annotation
states that no hosted runner acquired it after repeated attempts and reports
macOS arm64 capacity constraints. Preserve this as a cancelled, unverified leg;
the next candidate still requires the complete runtime matrix.

Original regression cases also cover strict baseline JSON, exclusive atomic
creation, update locking, literal nested Git paths, Git symlink rejection, a PR
rebaselining its own new finding, immutable report bundles and fresh diagnostics
when measurement fails. These cases address concrete shell contract gaps without
claiming that full quality-bash parity is finished.

## Third candidate CI investigation

All six workflows at `346b0e6a44b8535b5a20eecff6e906c0a273ed2f` finished
before the next fix batch. [Checks and release](https://github.com/link-foundation/code-quality/actions/runs/44140636696)
passed all nine Linux/macOS/Windows Node/Bun/Deno jobs, including the previously
unacquired macOS Bun leg. [Quality engine](https://github.com/link-foundation/code-quality/actions/runs/44140636617)
passed real shell QA, package imports, declarations and the non-root API container.
The workflow, link and example-app workflows passed too. Publication and deploy
steps retained their existing authorization conditions.

[Security](https://github.com/link-foundation/code-quality/actions/runs/44140636655)
passed CodeQL but both npm audits found a newly disclosed high-severity picomatch
advisory. The complete 5,849-line log was preserved before further edits. The
[dependency review](glob-dependency.md) records immutable source/package provenance,
a bounded failing-before/passing-after experiment and the compatibility tradeoff
of the exact reviewed patch. No security gate was weakened.

The fourth draft also adds the finite shell contracts identified by release-help
research: independent measurements, repeated file selection, isolated bounded
workers, audited incompatible migration, raw coverage export and Bats 1.14 abort
semantics. Its real-tool acceptance retains both original fixtures and their
assertions. The [shell comparison](quality-bash.md) continues to list unimplemented
distribution, Action and platform cases explicitly.

## Fourth candidate CI investigation

All six workflows at `88288e1ee8c3918ac1faa4931980edb78ced4b30` completed
before the fifth candidate. Security, workflow policy, links and the example app
passed. The installed package, public declarations and non-root Docker API passed
too. Two failures were preserved and read before preparing the combined fix:

- [Quality engine](https://github.com/link-foundation/code-quality/actions/runs/44148771355):
  `ci-logs/quality-engine-44148771355.log` line 812 reports a checksum mismatch.
  The workflow paired the ShellCheck gzip digest with an xz archive URL. The
  native installer now selects matching publisher URLs and digests from one
  architecture-specific manifest, and checks the bytes before extraction.
- [Checks and release](https://github.com/link-foundation/code-quality/actions/runs/44148771398):
  log lines 4872–4884 report three added Changesets. Consolidate the new notes
  into one fragment, retaining the existing base-branch fragments and release
  policy. The runtime matrix was skipped after that guard failed; it is not
  passing evidence for this revision.

The fifth draft installs and executes Bats 1.14, ShellCheck 0.11 and kcov 43 on
actual Linux amd64. Eight real measurements retain the original coverage and
mutation assertions and exercise the consumer Action's QA entry point. Native
arm64 and full same-revision CI remain pending. Downloads still require the
documented host shared libraries; bundling those dependencies and the remaining
quality-bash gaps are explicitly unfinished.

## Fifth candidate CI investigation

At `49bfc4e877b6ac6dd2a6193177c7c92357189320`,
[Checks and release](https://github.com/link-foundation/code-quality/actions/runs/44152938825)
passes all nine Linux/macOS/Windows Node/Bun/Deno jobs, static checks and release
metadata guards. Security, workflow policy and links pass.
[Quality engine](https://github.com/link-foundation/code-quality/actions/runs/44152938762)
passes actual amd64 shell QA, public declarations, installed-package imports,
the consumer composite Action and the non-root Docker API. Native arm64 fails
while fingerprinting the installed files: `ci-logs/quality-engine-44152938762.log`
lines 192–203 report `Tool installation byte budget exceeded`. All pinned archives
unpacked and version probes passed before that refusal.

Independent inspection of the checksum-verified arm64 ShellCheck archive shows
a 55,043,352-byte executable. Its size exceeds the original 32 MiB per-file bound.
The corrected candidate admits at most 64 MiB per file, still within the unchanged
128 MiB total installation budget. An original sparse-file regression hashes the
actual published size and refuses a file one byte above the new bound, without
allocating that entire input in memory. Native arm64 acceptance still requires
the next CI result. The example-app workflow's macOS package job remains queued
at the time this draft is written; it is not passing evidence.

The sixth draft also adds explicit upstream-schema baseline interchange. It
requires fresh complete native QA, an explained methodology migration, identical
file inventory and measurements at least as high as the imported floors. It keeps
the foreign source unchanged and refuses an existing destination. Actual amd64
acceptance passes nine measurements, including CLI import and repeat refusal.
Original regression tests also reject duplicate JSON keys in working files and
committed baseline blobs: silently keeping a later duplicate could otherwise
replace a stronger floor. Escaped aliases are rejected as well. These changes do
not establish full shell parity or universal competitor parity.

## Sixth candidate verification and private-runtime draft

All six workflows at `dbbcce7d424d9e15837d683d93825e943c1af6ab` pass.
[Quality engine](https://github.com/link-foundation/code-quality/actions/runs/44156199827)
passes real shell QA on native amd64 and arm64, the installed package, public
types, consumer composite Action and Docker API.
[Checks and release](https://github.com/link-foundation/code-quality/actions/runs/44156200086)
passes all nine Linux/macOS/Windows Node/Bun/Deno jobs.
[Security](https://github.com/link-foundation/code-quality/actions/runs/44156200101),
[workflow policy](https://github.com/link-foundation/code-quality/actions/runs/44156199953),
[links](https://github.com/link-foundation/code-quality/actions/runs/44156200010) and
[example app](https://github.com/link-foundation/code-quality/actions/runs/44156199946)
pass too. The previously queued fifth-candidate example app also finished
successfully before the sixth push.

The seventh draft resolves kcov's library closure independently from Debian's
public package indexes for both architectures, including security updates.
It checks package hashes before extraction, retains library/source notices and
common license texts, and does not execute package maintainer scripts. A private
loader path keeps its directly linked libraries separate from host libraries;
installation refuses unexpected host resolution except glibc. Host glibc >=2.36,
Bash >=5.2, Python and system configuration remain explicit dependencies. Local
metadata research used HTTPS index hashes, without a Debian signing keyring;
that distinction is preserved in [the provenance](data/shell-runtime-pins.json).
No competitor implementation or tests were inspected.

Original regressions reproduce missing Bash version enforcement, mid-measurement
tool changes, duplicate coverage counters/diagnostic fields and ignored malformed
TAP records. Each fails before its fix and passes afterward. Managed-tree hashes
cover helpers/libraries as well as executable bytes and survive relocation.
Actual amd64 QA passes nine measurements using the downloaded private libraries.
The stricter final diagnostic code and both new native-architecture installations
required exact-candidate verification. The [refusal audit](../../shell-diagnostics.md)
records finite evidence and remaining limits without certifying universal parity.

## Seventh candidate investigation and CMake draft

At `a764ae634625ad3fafc58e6b0548d19a26aa0de7`, [Quality engine](https://github.com/link-foundation/code-quality/actions/runs/44162751383)
passes actual private-library installation and QA on native amd64 and arm64,
including consumer-Action QA, independent baseline import, installed package,
public declarations and Docker API. Security, workflow policy, links and the
example app pass too. [Checks and release](https://github.com/link-foundation/code-quality/actions/runs/44162751518)
exposes two portable test-path defects. All six workflows completed before the
next push. Results remain tied to that exact revision.

- Windows Node, Bun and Deno each fail the same three original assertions.
  `ci-logs/checks-44162751518-windows-node.readable.log` lines 2202–2252 show a
  drive-letter colon being rejected as a loader-path separator before the
  expected Bash prerequisite, existing-destination and checksum refusals.
  Strip only a Windows host's anchored absolute drive prefix when checking
  loader tokens; retain rejection of every separator within the remaining path.
- macOS Node and Deno each fail the internal-library-alias case.
  `ci-logs/checks-44162751518-macos-node.readable.log` lines 2190–2201 show the
  resolved `/private/var` file compared with its unresolved `/var` staging root.
  Canonicalize the owned root once before containment checks. An original local
  symlink-root regression reproduces the failure and retains escape refusal.
- macOS Bun executes no steps and is cancelled at 20:24:09 UTC after repeated
  runner acquisition attempts. Its check annotations report hosted macOS arm64
  capacity constraints. The full workflow log archive and annotations are
  preserved; this unexecuted leg is not passing evidence. The next candidate
  still requires all nine runtime jobs.

The eighth draft replaces CMake's placeholder arity/complexity with original
literal argument and decision metrics. Initial regressions fail on invalid
command separation, escapes and unnamed definitions; evolution also initially
accepts unresolved headers and custom tree rules initially pass without a tree.
Their corrected paths refuse incomplete analysis. The methodology changes to
`cmake-native-v2`, requiring reviewed migration of older baselines.
[The CMake contract](../../cmake-analysis.md) defines the finite semantics and
budgets. [Recorded CMake 3.28.3 observations](data/cmake-contract-observations.json)
compare 20 original syntax scripts and ten formal-parameter fixtures, with both
sufficient and insufficient invocation arities. No project is built and no
upstream implementation or test suite is copied.

## Eighth candidate verification and real comparison

All six workflows pass at `3d3d488f997e9204ee41b24ec9ba9f03e4b20f46`.
[Checks and release](https://github.com/link-foundation/code-quality/actions/runs/44170720471)
passes every Linux/macOS/Windows Node/Bun/Deno job, including the earlier portable
path regressions. [Quality engine](https://github.com/link-foundation/code-quality/actions/runs/44170720324)
passes both native shell architectures, distribution and container contracts.
[Security](https://github.com/link-foundation/code-quality/actions/runs/44170720412),
[workflow policy](https://github.com/link-foundation/code-quality/actions/runs/44170720420),
[links](https://github.com/link-foundation/code-quality/actions/runs/44170720367)
and [example app](https://github.com/link-foundation/code-quality/actions/runs/44170720371)
also pass. No failed same-revision workflow remains to investigate.

The ninth draft executes the checksum-verified released quality-bash CLI with
original fixtures and the same installed external tools as the native engine.
The arithmetic fixture independently measures 3/5 coverage and 2/3 detected
mutants in both engines. Native explicit half-up and released rounding report
66.67; the native default remains floor at 66.66. A second fixture records a
numeric-literal candidate-set difference. Original regressions initially fail
because arithmetic operators and explicit rounding are absent; they pass after
the additions. Both policy choices remain fingerprinted, and existing baseline
migrations require review. Actual native CLI import keeps the released floor and
foreign source. The released CLI refuses absent/stale cached measurements.
See [methods and raw observations](../../shell-measurements.md).

Command-specific usage and meaningful options are available without a project or
external tools. The existing real-tool CI probe includes the arithmetic fixture
and explicit Action half-up setting, retaining every original acceptance assertion.
Exact-candidate and same-revision CI verification of this ninth draft remain pending.
The strict readiness gate still refuses unfinished compiler semantics and complete
competitor/proprietary/quality-bash cases.

## Helper/data freshness reproduction

The tenth draft identifies a measurement consistency gap: selected source/test
bytes were rechecked, while ordinary helper data and unselected shell helpers
were copied from the current root without a matching freshness check. Four
original replacement/addition/deletion/helper cases all failed before the fix
because a changed input tree still received a score. A real passing Bats control
also demonstrates the helper change and expected refusal after the correction.

The native engine now hashes the bounded copy input tree before execution and
checks it after measurement stages and tool verification. The fingerprint uses
relative names, entry kinds, permissions, sizes and streamed file hashes. Generated
report trees use the same exclusions as isolated copies. Selected inputs cannot
be hidden by an exclusion. The recorded method changes explicitly and earlier
shell baselines require reviewed migration. Original score assertions remain;
the comparison observations retain all raw counts and add workspace evidence.
See the [input contract and limits](../../shell-inputs.md). Exact-candidate and
same-revision CI verification of this draft remain pending.

Local verification of helper candidate `c0afb69` subsequently passes 128 Node
tests, 112 Bun and frozen-Deno cases, static/type/Changeset/file-limit checks,
package and isolated release checks, twelve real shell measurements and the real
helper refusal. All ten research hashes match and the released-tool comparison
regenerates byte-for-byte. Publication is grouped with the following token draft
while the ninth candidate's macOS runtime jobs wait for runners.

## Token-block duplication draft

Whole-function shapes cannot find an identical block within otherwise different
functions. The next native JavaScript draft adds optional bounded token pairs,
minimum-length gates, exact source ranges and explicit identifier/literal
normalization. Existing defaults and original tests remain. Comments and parser
whitespace are ignored; interpolated expressions and language boundaries remain
significant. An independent small all-pairs oracle checks 300 finite index cases,
including same-file nonoverlap boundaries. A regression first reproduces baseline
acceptance of a different repeated block with equal token count, then verifies
rejection using a normalized-token signature. Twenty-six focused cases pass on Bun
and Deno; the Node run including existing core cases passes 47 tests.

The CLI example, HTTP requests, SARIF findings, baseline method checks and
installed-package smoke use the same native engine. Unsupported CMake token
analysis and exhausted work budgets refuse complete evidence. The
[contract and limits](../../token-clones.md) and
[stable PMD 7.29.0 notes](data/pmd-cpd-contract.json) distinguish implemented
behavior from unverified language-specific lexer/options/grouping parity.
The combined candidate `77dedd9` subsequently passes 138 quality/glob cases on
each of Node, Bun and frozen Deno, plus 16 workflow-lint and 25 policy regressions
on Node. Static/types/Changeset/398-file guards, eleven source hashes, installed
package and isolated release versioning pass. Twelve real shell measurements and
the passing-control helper-change refusal pass; released comparison evidence
regenerates byte-for-byte. All six same-revision workflows pass, including the
[nine-leg runtime matrix](https://github.com/link-foundation/code-quality/actions/runs/44182935395)
and [both native shell architectures/distribution](https://github.com/link-foundation/code-quality/actions/runs/44182935047).

All six workflows for preceding candidate `6713d1e` pass. The runtime workflow's
first attempt lost its macOS Node job before any steps ran. GitHub annotations
state that no hosted runner was acquired and identify macOS arm64 capacity
constraints. The preserved attempt-one status log records `test: abandoned`;
the workflow's automatic failed-job retry succeeds without a source change.

## CMake token draft

CMake was the remaining unsupported token-clone mode. The original native reader
now optionally records command, parenthesis and whole-argument spans; default
analysis does not allocate this inventory. Raw argument kinds, dynamic references
and UTF-16 ranges remain visible. The existing bounded pair engine handles these
tokens without executing CMake or introducing another parser/dependency. The
enabled method gains `cmake-arguments-v1`, requiring reviewed baseline migration;
the default disabled method is preserved.

The original positive fixture first fails against the prior unsupported adapter.
Forty-six focused cases now pass on Node, Bun and frozen Deno, covering all
thirteen language modes, syntax/refusal behavior, CLI/HTTP equality, BOM/CRLF,
multiline Unicode spans, comment separation, normalization and baseline identity.
A finite 100,002-token probe runs with a 128 MiB heap and bounded stack and
refuses at the 100,000-token reader limit. Existing acceptance assertions remain;
the former unsupported fixture now uses a genuinely unresolved definition.
The [original contract notes](data/cmake-token-contract.json) distinguish this
lexical policy from the official language's execution rules. Project evaluation,
expanded metrics, tree-rule compatibility and exhaustive competitor parity remain
unfinished. Candidate `4ac4c97` passes 165 Node checks (149 quality/glob plus 16
workflow cases), 149 Bun and frozen-Deno cases, static/types/Changeset/402-file
guards, twelve source hashes, installed-package and isolated release checks.
The [native shell/distribution workflow](https://github.com/link-foundation/code-quality/actions/runs/44186142342),
Security, workflow policy, links, the full nine-leg runtime matrix and the example
app all pass. All six same-revision workflows were collected before the next push;
the checks workflow completed on its first attempt without failures.

## Reviewed comment region draft

The next native draft adds an explicit opt-in for comment-based clone regions,
informed by the stable PMD suppression documentation. Original cases initially
fail because the configuration is unsupported. The implementation recognizes
marker words only in actual comments, separates retained token segments and
records sorted UTF-16 ranges without source text. Syntax validation and other
rules remain active inside regions. Malformed sequences and exhausted marker
budgets refuse analysis rather than silently hiding additional code.

The [original contract notes](data/pmd-suppression-contract.json) distinguish
native choices from unverified CPD equivalence. CLI/HTTP and installed-package
checks use the same engine; the finite 10,002-marker probe runs with a 128 MiB
heap and bounded stack. Candidate `efad61a` passes 189 Node checks (173 quality/glob
and 16 workflow cases), 173 Bun and frozen-Deno cases, static/types/Changeset,
408-file guards, thirteen source hashes, installed-package and isolated release
checks. Publication is grouped with the following occurrence view; new
same-revision CI remains pending. Legacy annotation suppression, exhaustive language-specific
lexical behavior and full competitor parity remain unfinished.

## Clone occurrence view

Pair findings can repeat a location when a block occurs in three files. The
stable public PMD report-format overview describes multi-location reports. The
original native draft groups already verified pairs by language, token count and
normalized signature, deduplicating exact locations without inferring new
matches. Pair findings, gates and method fingerprints are preserved. Distinct
groups may overlap and are not transitively merged. Existing result limits bound
the additional view. JSON and SARIF retain locations without source text; text
reports group and occurrence counts.

Twenty original cases first fail because group metadata is absent. The first
native draft passes all twenty, plus 23 suppression and six consumer cases.
Fixtures cover three copies in thirteen modes, same-file shifted matches,
normalization, exact ranges, comment regions and deterministic ordering. The
[contract notes](data/pmd-group-contract.json) record provenance and the policy's
limits. Exact-candidate checks and new CI remain pending; this view does not
establish CPD grouping or full competitor equivalence.

## Optional annotation and directive comparison

The stable CPD option table describes ignoring Java/C# annotations and C# using
directives. Original native filters now omit the corresponding grammar ranges
from comparison while retaining complete syntax validation, custom/structural
rules and comment-region processing. Omitted tokens still consume shared work
budgets. Remaining tokens can join across these constructs; this differs from
explicit comment-region boundaries. Default methods are preserved, while enabled
filters are versioned and require reviewed baseline migration.

Initial original tests fail because these options are unsupported. Finite grammar
observations distinguish annotation uses from declarations, C# attribute-list
delimiters from ordinary brackets, and using directives from statements/local
declarations. The first draft also exposes an independent literal-normalization
gap: Java's six numeric grammar kinds are absent from the old atom inventory.
The numeric regression fails against an isolated `556f80c` source archive, then
passes with the corrected kind inventory. Literal normalization gains its own
method version; exact comparison remains unchanged. Seventeen filter/numeric
cases and seven consumer integration cases pass on Node. The
[contract notes](data/pmd-syntax-filter-contract.json) distinguish native choices
from unverified CPD equivalence. Candidate `76a904f` subsequently passes 227 Node checks, 211 Bun and
frozen-Deno cases, static/types/Changeset, 413-file guards, fifteen source hashes,
installed-package and isolated release checks. All six preceding `556f80c` workflows
pass on attempt one and were collected before publication; new filter CI remains
pending. GitHub refuses the combined PR diff above its 20,000-line service limit;
paginated patches and all 173 preceding blob identities were checked against
reviewed local Git history, including one differently coalesced package hunk.

## Structural pattern draft

The public Semgrep pattern overview provides feature concepts for nested syntax,
repeated bindings and scoped sequences. The native object API is independently
designed around each bundled grammar's named nodes. It supports exact kind/text
constraints, exact grammar fields/operators, ordered children, per-candidate
captures, repeated structural equality and one anchored sequence wildcard per child list. Capture equality preserves
operators, literal spelling and tree shape while ignoring comments/formatting.
It neither searches alternate wildcard splits nor crosses tree scopes.

Original cases cover twelve grammar modes, nested calls, negative operator/literal
boundaries, empty/middle/end wildcards, repeated captures across a wildcard,
candidate/rule isolation, exact text, legacy behavior, baseline boundaries and
CLI/HTTP/package consumers. Applicable CMake tree rules and malformed source
continue to prevent complete baselines. Configuration size/depth/string budgets
and one shared per-file comparison budget bound work. A finite 12,000-statement
probe uses a 128 MiB heap and bounded stack to reproduce end-to-end refusal.
The [original contract](data/structural-pattern-contract.json) records the native
policy and provenance. Exact-candidate verification remains pending. Semgrep
syntax, compiler equivalences, typed/list captures, Boolean combinations, dataflow,
taint, fixes and exhaustive parity remain unfinished.

## Evolution method and limits

Use a bounded first-parent range (default last 100 commits, hard limit 1000), inspect
Git trees and blobs without checking out source, and cache only matching blob/parser
snapshots. Match unique qualified names first, then unique identical content, then
unique normalized structure. Moves/renames preserve IDs only with such evidence.
Ambiguous matches become deletion/addition. The first snapshot is an observation
boundary, not proof of the true creation date. Side-branch ancestry is not traversed.

Normalize identifiers for edit signatures while preserving literal changes. Count
identical before/after signatures and retain commit/path/abstraction evidence. Rank
repeated transformations by frequency. Suggestions explicitly say observational;
a lower structural complexity score does not prove better behavior. Metrics include
nested Tree-sitter syntax, so class and nested-function complexities are inclusive
and must not be added as independent totals. CMake v2 counts decisions only in the
innermost function/macro and literal formal arity; expansion-derived arity is null
and refuses evolution. It does not evaluate project semantics. File hotspots count observed
changes; coupling omits commits with over 100 source files and refuses over 100,000
unique pairs. Snapshot, parser-node, byte, command-output and event budgets fail
explicitly. This is not semantic refactoring inference, all-history rename proof,
or an equivalent implementation of CodeScene's proprietary Code Health.

## Remaining acceptance criteria

The detailed [competitor matrix](competitors.md), [shell comparison](quality-bash.md)
and strict inventory are deliberately explicit: exhaustive discovery of all
competitors and all their documented cases has not been completed, enterprise and
semantic capabilities are missing, and full quality-bash parity is not verified.
There is no external outage preventing implementation of those features; they are
unfinished work. Passing current CI must not close that gap or justify merging as
full completion of issue 1. The PR remains unmerged.

## Candidate-local structural filters and combined verification

All six workflows pass at `76a904f8ad17310d8d2d05ec8ce1d08fe4c4b4bd`,
including the nine runtime legs, both native shell architectures, distribution
and Docker API, security, links, workflow checks and desktop packaging. Every
job finished on attempt one. The queued macOS desktop job acquired a runner and
passed; no new failure log or source change was needed.

The structural draft at `37bbe25` passes 235 quality/glob cases per runtime
(Node, Bun and frozen Deno), plus sixteen Node workflow checks. Static checks
have no warnings and 6.03% duplicated lines. Types, Changeset validation,
419-file line guards, installed-package consumers, isolated release versioning
and all sixteen source hashes pass. Twenty-two new native public-rule cases
fail against isolated preceding source; all twenty-four structural cases now
pass, including bounded work and CLI/HTTP consumers. The finite capture probe
uses a 128 MiB heap and bounded stack; comparison work includes hashed metadata
bytes. No acceptance assertions were removed.

The additional original filter draft advances the public conjunction, alternatives
and negative-filter families described by [Semgrep's rule syntax](https://docs.semgrep.dev/writing-rules/rule-syntax). Every `all`, `any` and `not`
clause inspects one candidate. Base constraints bind captures first; clauses inherit
independent copies and discard temporary bindings. Boolean truth values therefore
do not depend on sibling evaluation order. There is no range intersection, ancestor
search, cross-clause capture assignment or Semgrep syntax/binding compatibility.
The [native contract](data/tree-predicate-contract.json) records the independently
designed semantics, budgets, method boundary and original evidence.

Original cases cover positive/negative selection, nested negation, anonymous
operator fields, inherited and discarded bindings, all twelve grammar modes,
validation refusals, finite work bounds, CLI/HTTP reports and baseline migration.
Applicable CMake tree rules continue to refuse incomplete analysis. Exhaustive
compiler/project semantics, dataflow/taint, fixes, proprietary documented cases
and quality-bash parity remain unfinished in strict readiness.

## Bash grammar/runtime regression

The combined structural/filter candidate at `ac3a370` passes all 273 Node and
257 Bun/frozen-Deno quality/glob/workflow cases, static/types/package/release,
423-file guards and seventeen source hashes. Both reviewed committed diffs match
byte-for-byte and all 194 paginated PR file blob identities match the candidate.
Five CI workflows pass; the exact-head runtime matrix is still queued.

A new original finite shell operator fixture reproduced a valid Bash parser crash
on `[[ word == word ]]`. The bundled 0.20.5 grammar imports `isalpha`, absent
from its 0.20.8 runtime. Runtime-only 0.22.6/0.24.7 probes also fail. The official
Bash 0.23.3 release asset with a separate pinned 0.24.7 runtime passes literal,
variable and Unicode patterns, case alternatives and heredocs. Other languages
retain their parsers and method identities. Bash reports/measurements version
the exact new grammar/runtime/hash and require reviewed baseline migration.

The [artifact contract](data/bash-parser-contract.json), retained MIT license and
[parser documentation](../../bash-parser.md) record the binary provenance, import
failure, compatibility probes, finite cases and limits. The asset has no published
release digest; the pin is our recorded HTTPS artifact hash. Original tests require
valid parsing/extraction, preserved syntax refusals, tree predicates, clones,
comparison offsets, corrupted-artifact refusal and CLI/HTTP/package consumption.
The original [Bats example](../../../examples/code-quality/shell-syntax/README.md)
exercises a case label, unquoted pattern and quoted heredoc. No upstream analyzer
implementation or tests were read. Full semantic, operator and diagnostic parity
remains unfinished.

The original eight valid parsing cases fail seven times against isolated preceding
source and all pass after correction. Fourteen new cases pass on Node, Bun and
frozen Deno, including source offsets after non-ASCII/astral text. The installed
tarball and actual Bats pattern/case/heredoc example pass. Real QA retains the
prior 3/5 arithmetic coverage, 2/3 mutation result and 100% stronger-control
fixture. The real-shell CI experiment also runs the new Bats assertions. The
finite released-CLI operator observation and original fixture hashes are retained
in the artifact contract: eleven released candidates versus fourteen native
candidates, with arithmetic ordering and multiplication-policy gaps explicit.

The [expanded mutation policy](../../shell-mutations.md) preserves valid default
operator contracts while adding arithmetic ordering complements and another
multiplication fault model. Exact grammar fields exclude ordinary logical strings
and comparison operands. Original before/after observations and real Bats results
are retained in [the operator contract](data/shell-operator-contract.json).
All nine 2ed6798 runtime failures came from one npm-alias expectation in the strict
dependency guard; [the investigation](bash-alias-ci.md) preserves each job/error
reference and the correction retains dependency equality and lock assertions.
