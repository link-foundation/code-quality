# Native bounded dataflow

Opt-in `taintRules` track untrusted values through a bounded straight-line subset
of JavaScript, TypeScript and TSX. Rules run in the library, `check` CLI and HTTP
analysis without executing project code. Each rule explicitly selects its
languages; files in other languages are outside that rule's scope.

```json
{
  "taintRules": [
    {
      "id": "local/command-flow",
      "message": "Untrusted command",
      "languages": ["javascript", "typescript", "tsx"],
      "sources": ["input.read"],
      "sinks": [{ "call": "execute", "argument": 0 }],
      "sanitizers": ["validateCommand"],
      "propagators": ["decorate"]
    }
  ]
}
```

Call names match an exact identifier or dotted property chain. Bracket access,
aliases, optional calls and dynamic receivers refuse analysis. The configuration
is a trust decision: sources supply tainted return values, sanitizers supply clean
return values, and propagators return the union of their arguments' taint. These
are opaque return-value models without mutation of caller bindings. Sink argument
positions are zero-based; sink returns conservatively preserve argument taint.
An absent argument is clean. Call roles must be disjoint.

Every simple formal parameter of each analyzed function is also an untrusted
source. `sources: []` selects parameter sources alone. Function bodies are
analyzed independently as possible entry points, regardless of call sites.
Local calls are unsupported; there is no interprocedural return propagation.
Only named, synchronous top-level function declarations, optionally exported,
are supported. Function scopes never inherit module or sibling bindings.
Bindings require simple ASCII identifiers; escaped and Unicode spellings refuse
analysis instead of bypassing the call-model shadowing checks.

Simple declarations, assignment, eager binary operators, template substitutions,
parentheses and type assertions propagate taint. A reassignment replaces a
binding's value; previously copied values retain their paths. Assignment to a
constant refuses analysis. Unary operators propagate their operand, except `void`,
whose result is clean. Arguments still evaluate before a source or sanitizer
returns, so an enclosing sanitizer cannot hide a nested sink. Calling a sanitizer
without using its return value does not clear the original binding.

With the default `controlFlow: "straight-line"`, branches, loops, short-circuit
operators and conditional expressions refuse analysis. Imports,
classes, objects/arrays, destructuring, closures, async/generator functions and
unmodeled calls refuse analysis. Scope declarations are inventoried even after
a return to reject shadowed models, duplicate bindings and unsupported statements.
Execution tracing stops at a return. This subset does not implement a compiler,
type resolution, framework models, exceptions, heap analysis or cross-file flow.
Trusting a sanitizer's name does not establish that its implementation is safe.

A finding includes an ordered `dataFlow` with source/parameter, assignment,
propagator and sink steps, file/line/column and UTF-16 start/end offsets. Text
reports show these steps; SARIF exports `codeFlows`/`threadFlows`. One deterministic
path per origin and sink argument is retained; equivalent merged paths are not
enumerated. Findings from a rule are discarded if any supported-scope analysis
fails; an `unsupported-analysis` error marks the report incomplete and prevents
a passing gate or complete baseline.

Configuration permits at most 25 rules, 32 names per call role, 32 sink arguments
per rule and argument indexes 0 through 31. Names are ASCII identifier chains of
at most 256 characters. Each file shares 100,000 charged work units across its
rules. Limits are 128 expression levels, 128 trace locations, 64 origins per
value, 512 bindings per scope and 1,000 findings per rule. Existing file, parser
and report budgets also apply. Exhaustion returns explicit incomplete evidence.

Absent or empty `taintRules` retain the existing methodology fingerprint. Enabled
models include their normalized configuration and `straight-line-call-models-v1`
in the method. Enabling or editing models requires the existing reviewed baseline
migration process.

## Opt-in branch joins

Set a rule's `controlFlow` to `"branch-joins"` to enable `if`/`else`, standalone
lexical blocks, conditional expressions and `&&`/`||`/`??`. An omitted setting
or explicit `"straight-line"` preserves the existing model and method.

Conditions evaluate once before both possible arms. Each arm receives an
independent binding map; the join retains the union of each outer binding's
possible origins. A sanitizer must clear every continuing arm to remove taint.
An arm that returns contributes findings inside that arm, but does not reach
following statements. Both returning arms stop the enclosing scope. Short-circuit
expressions retain both the skipped value/state and the evaluated right side.
Conditions alone do not taint constant results: implicit control taint is absent.

Block-local `let`/`const` bindings disappear at block exit; assignments to outer
bindings remain. Nested `var`, any binding shadowing, local function declarations
and unsupported statements refuse analysis, including after an early return.
The preflight inventories every lexical scope before tracing. Scope reads before
declaration still refuse, rather than guessing TDZ or hoisting behavior.

This analysis conservatively visits both arms even for constant conditions.
It does not prove feasibility, correlate predicates, prune constant branches or
enumerate paths. A trace demonstrates possible modeled data propagation and can
be infeasible. Loops, exceptions, closures, heap, type/framework resolution and
interprocedural analysis remain unsupported. Return-value model trust still applies.

Each file shares a limit of 256 conditional forks across rules and a maximum
nesting of 32 control/lexical scopes. Forks charge binding and trace copies to the
existing work budget. Unsupported/exhausted rules discard partial findings and
remain incomplete. Enabled joins use `branch-join-call-models-v1`; changing from
straight-line models requires reviewed baseline migration.

Run the [original branch example](../examples/code-quality/taint-branches/README.md).
Its [contract ledger](case-studies/issue-1/data/taint-branch-contract.json) separates
independent finite cases from complete competitor semantics and accuracy claims.

Run the [original two-file example](../examples/code-quality/taint/README.md)
for a tainted flow and a sanitized return. The [contract and provenance](case-studies/issue-1/data/taint-contract.json) distinguish this finite native subset
from Semgrep and Snyk public capability concepts. Complete compiler/dataflow,
proprietary documented cases and competitor parity remain unfinished.
