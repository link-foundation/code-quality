# Token-block duplication

`analyzeFiles`, `analyzeProject`, CLI `check --config` and HTTP `/v1/analyze`
accept this optional configuration:

```json
{
  "clones": {
    "minTokens": 50,
    "ignoreIdentifiers": false,
    "ignoreLiterals": false
  }
}
```

The default is disabled. `minTokens` accepts integers from 1 through 1,000;
names and literal values remain significant unless their corresponding option is
enabled. Unknown options and nonboolean normalization flags are errors. Existing
whole-function structural duplication remains a separate rule. Direct
`analyzeSource` performs per-file rules; aggregate duplication belongs to
`analyzeFiles`, even when its input has just one file.

The original native JavaScript implementation compares syntax token sequences
within each language domain. It removes comments and parser whitespace, retains
punctuation, and treats noninterpolated strings/numbers as atomic literals.
Interpolated expressions remain visible. Identifier normalization covers grammar
identifier nodes; it does not resolve bindings or prove semantic equivalence.
Literal normalization preserves the grammar literal kind. This token policy is
versioned independently from competitor lexers and may produce different counts.

A rolling seed indexes candidates; every reported match is verified token by
token, so hash collisions cannot create a finding. The report includes maximal
matching **pairs**, with token counts and both source ranges. Ranges use zero-based
JavaScript string offsets and one-based line/column positions; ends are exclusive.
Pairs may share occurrences; they are not merged into transitive clone groups.
Same-file pairs must not overlap. Matching never crosses file or language boundaries.
Source text and token spellings are absent from clone records. Each pair includes a
SHA-256 signature of its normalized token identities, independent of input order.

Each pair adds a `duplicate-tokens` warning at its second occurrence, so normal
gates, JSON, SARIF and baselines include the result. SARIF retains both ranges
through its primary and related locations. Finding fingerprints do not depend on
line shifts from added comments. They include the normalized token signature, so
a different repeated block with equal length cannot inherit its acceptance. Enabled settings and
`bounded-token-pairs-v1` enter the method fingerprint. Changing a threshold or
normalization policy requires reviewed baseline migration. Disabled analysis
preserves the previous method. File ordering does not change clone pairs.

All thirteen language modes are supported: twelve use Tree-sitter tokens and
CMake uses the existing native reader. CMake commands, parentheses and whole
arguments are tokens. Quoted, bracket and unquoted arguments retain distinct
kinds and raw spellings, including escapes and embedded whitespace. Command
spelling is significant even though CMake executes command names without case
sensitivity. Identifier normalization covers command names and plain unquoted
names (`[A-Za-z_][A-Za-z0-9_]*`). Literal normalization covers static remaining
arguments; it preserves their kinds and does not erase quoted/unquoted variable,
environment or cache references, or text containing `$<` generator markers.
Bracket variable references remain literal. These are
lexical comparisons; variable expansion and command execution are not performed.
Enabled methods additionally include `cmakeTokens: cmake-arguments-v1`, requiring
reviewed migration from earlier token baselines, including mixed-language ones.
Disabled methods remain unchanged. See the [CMake adapter](cmake-analysis.md).

Syntax errors and unresolved CMake definition metrics remain incomplete evidence;
affected reports are not silently treated as clean or permitted into baselines.

Work is bounded by 100,000 total tokens, 16 MiB of interned token keys,
100,000 candidate pairs, five million token comparisons and 10,000 result pairs.
Existing source-byte, traversal and total-finding budgets also apply. Repetitive
input that exceeds a budget throws an explicit error instead of returning a
truncated passing report. `tests/quality-clones.test.js` uses a finite 900-statement
candidate probe. No worker, compiler, external lexer or additional dependency is used.
The CMake reader also caps its per-file token inventory at 100,000; a finite
100,002-token probe runs with a 128 MiB JavaScript heap and bounded stack.

`experiments/code-quality/clone-oracle.mjs` independently enumerates all pairs in
sixty small token inventories at five thresholds. Its 300 comparisons include
shifted same-file pairs whose left extension would overlap. The integration suite
runs this oracle in a process with a 128 MiB JavaScript heap and bounded stack.

The [original example](../examples/code-quality/token-clones/README.md), CLI/HTTP
tests and language fixtures verify threshold boundaries, exact locations,
normalization, comment handling, interpolation, self-overlap and refusals.
The [CMake example](../examples/code-quality/cmake-clones/README.md) also verifies
matching CLI/HTTP findings and UTF-16 ranges across BOM, CRLF and multiline input.
The public [PMD 7.29.0 CPD contract](https://docs.pmd-code.org/pmd-doc-7.29.0/pmd_userdocs_cpd.html)
informed the feature inventory. Its implementation and tests were not inspected.
CPD's full language-specific options, suppression controls, clone grouping and
lexical equivalence remain unverified parity criteria.
