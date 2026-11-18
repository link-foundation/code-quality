# Shell mutation policies

`mutation`, `qa`, `baseline-check` and `baseline-update` accept
`--mutation-policy standard|expanded`. The library accepts
`shellQuality(root, { mutationPolicy: 'expanded' })` and
`shellMutants(file, max, { policy: 'expanded' })`; the consumer Action accepts
`mutation-policy: expanded` for `command: qa`. The default is `standard`.

| Operators                                            | Standard replacements                                 | Additional expanded replacements           |
| ---------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| Arithmetic `+`, `-`, `*`, `/`                        | `-`, `+`, `/`, `*` respectively                       | `*` also becomes `+`, as a separate mutant |
| Arithmetic `<`, `<=`, `>`, `>=`                      | None                                                  | `>=`, `>`, `<=`, `<` respectively          |
| Comparisons `-eq`, `-ne`, `-gt`, `-ge`, `-lt`, `-le` | `-ne`, `-eq`, `-le`, `-lt`, `-ge`, `-gt` respectively | Same                                       |
| Comparisons `=`, `==`, `!=`                          | `!=`, `!=`, `==` respectively                         | Same                                       |
| Logical `&&`, `\|\|`                                 | `\|\|`, `&&` respectively                             | Same                                       |
| Grammar numeric nodes `0`, `1`                       | `1`, `0` respectively                                 | Same                                       |

Operator candidates use exact grammar fields or anonymous command-list operator
nodes. Ordinary quoted `&&`/`||` text and `/` comparison operands stay intact.
Expanded ordering complements require an arithmetic expansion/command or C-style
for context, including nested parentheses, unary and ternary expressions. String
ordering in `[[ left < right ]]` stays intact: Bash has no corresponding `>=`
string operator. This is a finite operator inventory, not full Bash semantics or
complete competitor parity. Associative array evaluation and dynamically generated
shell commands are not evaluated by the extractor.

Both policies share deterministic source order, exact UTF-16 edit ranges and
bounded candidate counts. The two multiplication replacements occupy separate
candidate slots. The extractor's `max` caps its returned list; complete QA probes
one candidate beyond `maxMutants` and refuses overflow rather than scoring a
partial inventory. Mutation workers, TAP validation and execution limits retain
their existing contracts. There is no score for a source with no eligible mutants.
Arithmetic context traversal has a 512-parent limit and refuses exhaustion.

Reports record `measurement.mutationPolicy`; the policy and corrected
`bash-operator-fields-arithmetic-context-v3` identity enter the method fingerprint.
Earlier methods and changes between policies require fresh complete QA plus an
explained baseline migration. Compatible floors cannot decrease. Scheduling worker
counts remain outside the method identity. Independent `mutation` reports cannot
establish QA baselines.

The [original example](../examples/code-quality/shell-expanded/README.md) demonstrates
why additional fault models matter. Its exact ordering assertion detects all four
ordering complements. Its deliberately weak even-product assertion detects
`*` → `+` but misses `*` → `/`: standard measures 0/1 killed, expanded 5/6 killed
(83.33% with default floor). These percentages have different denominators; they
are observations for this fixture, not a cross-tool accuracy ranking.

`tests/quality-shell-operators.test.js` covers original candidate boundaries,
policies, edit ranges, nested contexts, budgets, invalid options and baseline
incompatibility. Action, type and installed-package checks cover consumer settings.
`experiments/code-quality/expanded-shell.mjs`, called by real-shell CI, executes
the original Bats assertions and actual CLI policy selection with one worker.
The earlier released-CLI observation in
[the parser contract](case-studies/issue-1/data/bash-parser-contract.json) motivated
the expanded ordering and multiplication models; no competitor implementation or
test files were inspected or copied.
