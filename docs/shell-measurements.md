# Shell mutation and rounding methods

`shellQuality` measures trusted Bash sources with external ShellCheck, Bats and
kcov. Native Tree-sitter traversal generates independent mutants. The default
policy changes Boolean conjunction/disjunction, supported test comparisons,
binary numeric literals `0`/`1`, and arithmetic `+`/`-`/`*`/`/` operators. Arithmetic
changes apply to binary-expression operator nodes; identical ordinary command
text is left alone. A finite mutation budget refuses partial scores.

Coverage retains executable-line totals and hit counts. Mutation evidence retains
every candidate and its detected/survived outcome. Percentages use integer ratio
arithmetic, with two explicitly supported policies:

| Policy    | 2/3   | 1/32 | Default |
| --------- | ----- | ---- | ------- |
| `floor`   | 66.66 | 3.12 | Yes     |
| `half-up` | 66.67 | 3.13 | No      |

```sh
node bin/code-quality.js baseline-update ./project --create --rounding half-up
node bin/code-quality.js qa ./project --rounding half-up
node bin/code-quality.js coverage ./project --rounding half-up
```

The library accepts `shellQuality(root, { rounding: 'half-up' })` and
`parseKcov(report, { rounding: 'half-up' })`. The consumer Action accepts
`rounding: half-up`. Unsupported policies fail before tool or project execution.
The CLI permits this option on QA, coverage, mutation and baseline commands.

The new arithmetic policy and exact percentage algorithm version the shell
method. Existing shell baselines therefore require a reviewed `--migrate`
explanation, fresh complete measurements and the chosen rounding policy. Changing
rounding also changes the method fingerprint; scheduling workers does not.
Compatible baselines still reject every decrease. Imported quality-bash floors
are preserved; see [baseline interchange](baseline-interchange.md).

## Original comparison with a released CLI

The bounded [comparison experiment](../experiments/code-quality/shell-comparison.mjs)
executes the checksum-verified Linux amd64 `quality-bash` v1.0.0-alpha.5 binary.
Its documented installer populated a separate owned cache. Both engines used that
same Bash 5.2.21, Bats 1.14.0, ShellCheck 0.11.0 and kcov 43 toolchain, one worker
and 30-second subprocess budgets. No competitor implementation or tests were read.
The [recorded observations](case-studies/issue-1/data/shell-comparison-observations.json)
retain raw public reports, original input hashes and redacted temporary paths.

| Original fixture    | Both coverage counts | Native mutation counts | Released mutation counts | Native / released percentages        |
| ------------------- | -------------------- | ---------------------- | ------------------------ | ------------------------------------ |
| `numeric-condition` | 3/5                  | 2/3                    | 1/2                      | 66.66 default, 66.67 half-up / 50    |
| `arithmetic`        | 3/5                  | 2/3                    | 2/3                      | 66.66 default, 66.67 half-up / 66.67 |

The arithmetic case independently exercises a comparison, addition and return
code. Its candidate replacements and outcomes agree in this finite observation.
The numeric-condition case records an additional native literal mutant. Scores
from different candidate sets cannot establish comparative detection quality.

The released CLI refuses `baseline-update` before a measurement exists. After QA
it refuses a cached measurement when the original test file changes, and accepts
the measurement after the exact bytes are restored. Native baseline updates
perform fresh QA themselves. The arithmetic case also verifies actual native CLI
import of the released 66.67 floor with explicit half-up rounding; default floor
refuses it, and the foreign source remains unchanged.

These observations do not establish all operator, language, platform or diagnostic
equivalence. Broader quality-bash parity remains partial in strict readiness.
Original arithmetic, exact rounding, method and refusal regressions are in
`tests/quality-shell-arithmetic.test.js`; existing floor-score assertions remain.
