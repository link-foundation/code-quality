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

| Component        | Alternatives considered                                                | Choice and consequence                                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language parsing | Compiler subprocesses, native ast-grep/NAPI, Tree-sitter WASM, regex   | Pinned web-tree-sitter 0.20.8 + tree-sitter-wasms 0.1.13 run without native compilation on all three JS runtimes. Syntax trees do not supply type resolution. Old grammar snapshots can reject newer syntax. |
| CMake            | Execute CMake, cmake-lint, general regex                               | Original native command/bracket/block adapter, with explicit semantic and metric gaps. CMake execution can run project code; it is not automatic.                                                            |
| Rules            | Semgrep DSL, ESLint plugin, custom code evaluation                     | Small declarative AST-kind/literal rules plus versioned library plugins. Arbitrary regex and config code are not executed. No Semgrep DSL compatibility claim.                                               |
| Reports          | Proprietary database, SARIF, JSON only                                 | Deterministic JSON/text and SARIF 2.1.0 with stable occurrence fingerprints. No hosted dashboard or SARIF consumer certification.                                                                            |
| Git mining       | PyDriller, GitPython, git log only, custom diff parser                 | Git plumbing plus syntax snapshots; no checkout/worktree writes. Unique identity matches across revisions, repeated normalized before/after edits, file hotspots and temporal coupling.                      |
| API              | Express/Fastify, raw HTTP                                              | Node HTTP with bounded bodies/concurrency, startup-only workspace and optional constant-time bearer auth. No database/multitenancy.                                                                          |
| Shell QA         | Reimplement ShellCheck/Bats/kcov, copy quality-bash, explicit adapters | Execute independently installed trusted tools and validate their outputs. Mutation operators and baseline logic are original JS. No quality-bash implementation or test source was read.                     |
| Packaging        | Rust binary, native addon, portable JS                                 | npm library and CLI plus non-root Node container. Source package stays small; grammar data is a separate pinned dependency.                                                                                  |

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
nested syntax, so class and nested-function complexities are inclusive and must not
be added as independent totals. CMake reports complexity 1 and parameters 0 as
unsupported metrics, not accurate language metrics. File hotspots count observed
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
