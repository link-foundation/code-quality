# Candidate-local tree filters

Run the original native-rule example:

```sh
node bin/code-quality.js check examples/code-quality/tree-predicates --config examples/code-quality/tree-predicates/quality.json --format json
```

The command exits 1 and reports only `primary(item)` at line 2. The conjunction
requires one argument; the alternatives select `primary` or `secondary`; the
negative filter excludes `secondary`. Each filter evaluates the same candidate.
Temporary captures stay within each clause. This observational review policy
does not establish that these calls are unsafe.

See [native structural rules](../../../docs/tree-patterns.md) for capture scope,
resource limits and remaining language/product semantics.
