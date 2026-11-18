# Original branch-join flow example

From the repository root:

```sh
node bin/code-quality.js check examples/code-quality/taint-branches --config examples/code-quality/taint-branches/quality.json --format sarif
```

Expected exit: 1 with one flow in `unsafe.js`. The safe example uses the trusted
sanitizer return on both possible arms. The unsafe example leaves a possible
unsanitized path. Analysis does not execute either module.

`controlFlow: "branch-joins"` is explicit opt-in. Both possible arms are analyzed;
predicate correlations and constant pruning are not proved. A reported path can
be infeasible. Loops, local calls, closures, heap/type/framework semantics and
exhausted budgets remain explicit incomplete refusals. See
[the native flow contract](../../../docs/dataflow.md).
