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
Java decimal/hex/octal/binary integers and decimal/hex floating-point literals
normalize within their respective grammar kinds. Enabled literal normalization
now records `grammar-literals-v2`; earlier token baselines using `ignoreLiterals`
require reviewed migration. Exact comparisons keep their existing method.

A rolling seed indexes candidates; every reported match is verified token by
token, so hash collisions cannot create a finding. The report includes maximal
matching **pairs**, with token counts and both source ranges. Ranges use zero-based
JavaScript string offsets and one-based line/column positions; ends are exclusive.
Pairs may share occurrences; different signatures/lengths are not merged transitively.
Same-file pairs must not overlap. Matching never crosses file or language boundaries.
Source text and token spellings are absent from clone records. Each pair includes a
SHA-256 signature of its normalized token identities, independent of input order.

When token analysis is enabled, `cloneGroups` also collects each pair's locations
by language, token count and normalized signature. Each location appears once
within its group, ordered by path and offsets. Groups are ordered by decreasing
token count, then language and signature. This is a view of verified pair results;
it does not infer additional matches or change per-pair findings, gates, baseline
identities or method fingerprints. Different groups may overlap; locations
collected from different nonoverlapping pairs need not all be mutually
nonoverlapping. Enabled analysis with no matches returns an empty array; disabled
analysis omits this property. JSON and SARIF run properties retain groups, and
text reports their count and the sum of their occurrence counts. Existing limits
bound the view to 10,000 groups and 20,000 location entries. No source text is added.

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
The public [report-format overview](https://docs.pmd-code.org/pmd-doc-7.29.0/pmd_userdocs_cpd_report_formats.html)
also describes multi-location duplicate reports. Native occurrence groups follow
the original policy above; equivalence to CPD's grouping, full language-specific
options, legacy annotation suppression and lexers remains unverified.

## Reviewed comment regions

Set `clones.suppressionComments` to `true` to recognize the case-sensitive words
`CPD-OFF` and `CPD-ON` inside actual language comments. The default is `false`;
explicit `false` produces the same report/method as absence. Words inside string
or argument literals have no effect. The option applies to every supported mode,
including CMake line/bracket comments. It affects token clones only: syntax,
structural rules, custom rules and whole-function duplication still inspect the
complete original source.

Regions run from the end of an OFF marker to the beginning of its paired ON
marker. Each retained segment is compared separately, so a match cannot bridge
an omitted region. JSON exposes the sorted `cloneSuppressions` ranges; SARIF
retains them under run properties, and text reports their count. Ranges follow
the same UTF-16/exclusive-end convention as clone locations. Source text is not
included in this metadata. The
[original example](../examples/code-quality/clone-suppression/README.md)
demonstrates the review evidence.

The native policy rejects an unmatched ON, nested OFF or unterminated OFF instead
of silently hiding additional source. At most 10,000 markers are allowed across
the analysis; token/source/parser work budgets still apply to omitted code.
CMake's optional trivia and token records share its 100,000-entry reader limit.
A finite 10,002-marker probe uses a 128 MiB heap and bounded stack. Invalid syntax
inside a region still makes the report incomplete and prevents baselining.

Enabled methods include `cpd-comment-regions-v1` and require reviewed baseline
migration. This is an original comment-based contract informed by the stable
[PMD suppression documentation](https://docs.pmd-code.org/pmd-doc-7.29.0/pmd_userdocs_cpd.html#suppression).
The default opt-in policy, strict malformed-marker refusals and explicit region
boundaries are native choices. Legacy Java annotation suppression and all
language-specific CPD lexical details remain unverified.

## Optional syntax filters

Set `clones.ignoreAnnotations` to `true` to omit Java annotation uses and C#
attribute lists, including their delimiters and arguments. Java annotation type
declarations remain visible. Set `clones.ignoreUsings` to `true` to omit C#
namespace, alias and static using directives. Using statements and local using
declarations remain visible. These flags do not affect constructs in other
languages, such as Python decorators or C++ using declarations. Both flags default
to false; explicit false preserves the prior report and method.

Filters compare the remaining tokens as a continuous sequence. Unlike comment
regions, they may join tokens on either side of an omitted construct; reported
ranges may include that omitted source between retained tokens. Parsing, custom
rules, structural rules and comment-region markers still inspect the complete
source. All omitted tokens consume shared token/key/traversal budgets. Invalid
syntax remains incomplete evidence and cannot be baselined. This is syntax-only
comparison; it does not resolve annotation types or imports.

Enabled methods record `annotations-usings-v1` and require reviewed baseline
migration. See the [original Java example](../examples/code-quality/clone-filters/README.md)
and [public-contract notes](case-studies/issue-1/data/pmd-syntax-filter-contract.json).
The stable CPD documentation names these options; the native grammar policy,
budgets and refusals are original and do not establish full lexer/options parity.
