# Native CMake analysis

The original `cmake-native-v2` adapter implements the public
[CMake language grammar](https://cmake.org/cmake/help/latest/manual/cmake-language.7.html)
with modern escape policies. It parses source without executing CMake, configuring
a build, expanding variables or loading project modules.

It preserves source offsets, accepts a leading BOM and CRLF, balances parentheses
and blocks, and separates commands on newlines. Comments, quoted/bracket arguments,
escaped separators and legacy embedded quotes/make references are distinguished.
Invalid command separation, escapes, unnamed definitions and misplaced branch/end
commands produce syntax findings. An optional mismatched end-function name is
accepted: the independent CMake 3.28.3 probe reports only a developer warning.
This adapter does not reproduce every CMake command's argument validation or
historical policy behavior.

Functions and macros expose literal formal parameter counts under CMake's quoted,
bracket and unquoted-list rules. Complexity starts at one and adds one per `if`,
`elseif`, `foreach` and `while` in that definition. Nested functions/macros have
separate counts and qualified names. Conditions are not evaluated. Logical `AND`
and `OR` add no decisions: CMake's [condition documentation](https://cmake.org/cmake/help/latest/command/if.html)
specifies no short-circuit evaluation. This is our
structural metric, not a claimed equivalent of another tool's proprietary score.

Unquoted `${...}`, `$ENV{...}` and `$CACHE{...}` in a definition header can expand
into an unknown number of formal parameters. `parameters` is then `null`, an
`unsupported-analysis` error explains the missing measurement and the report is
incomplete. A variable-derived definition name also marks the report incomplete,
even when quoted arity is known. Baseline creation and evolution refuse these
cases. Quoted formal arguments still count as one; bracket contents stay literal.
Included modules, macros at runtime, dynamic command generation, types and
generator-expression evaluation remain outside the adapter's semantics. Custom
Tree-sitter rules and syntax-node plugins have no CMake tree to traverse.
Applicable custom tree rules produce an `unsupported-analysis` error rather than
silently succeeding; plugins receive the documented nullable root. The strict
readiness inventory records this partial adapter.

Optional [token-block duplication](token-clones.md) uses lexical spans from this
same reader, without a Tree-sitter tree. Commands, parentheses and whole arguments
form the token inventory; comments and separating whitespace are omitted. The
raw argument kind/text remain significant unless normalization is explicitly
selected. This separately versioned `cmake-arguments-v1` contract follows the
[CMake 3.28 language categories](https://cmake.org/cmake/help/v3.28/manual/cmake-language.7.html),
with original cases in `tests/quality-clones-cmake.test.js`. It establishes lexical
duplication only and does not complete the adapter's missing project semantics
or tree-rule compatibility. Default analysis does not allocate token inventories.

The parser is iterative. It bounds source text, 50,000 commands, 200,000 argument
tokens, 512 nested parentheses/blocks, 1000 diagnostics, 4096 UTF-16 code units
per qualified name and 4 MiB of aggregate definition spans. Project analysis
also applies its existing UTF-8 byte and report budgets. Exceeded budgets refuse
the analysis instead of returning a partial passing report.

The report methodology fingerprint changes from `cmake-native-v1` to
`cmake-native-v2`, including for mixed-language reports. Existing baselines need
an explicitly reviewed migration; comparisons never silently accept changed
metrics. Original regressions in `tests/quality-cmake.test.js` and
`tests/quality-cmake-evolution.test.js` preserve refusal and structural behavior.
`experiments/code-quality/cmake-contract.mjs` runs finite original scripts with
CMake 3.20 policies and checks both accepted/rejected syntax and minimum call
arity. It builds no project. [The recorded observations](case-studies/issue-1/data/cmake-contract-observations.json)
identify the actual CMake version used; they establish these finite cases only.
