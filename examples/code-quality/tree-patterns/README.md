# Repeated delivery targets

The local rule flags a two-argument `deliver` call whose argument syntax trees
are identical after removing comments and formatting. It reports line 2 only;
line 3 uses different targets. This is an observational project policy, with no
claim that a repeated target is always incorrect.

From the repository root:

```sh
node bin/code-quality.js check examples/code-quality/tree-patterns --config examples/code-quality/tree-patterns/quality.json --format json
```

The command exits 1 with `local/repeated-target`. See the
[tree pattern contract](../../../docs/tree-patterns.md) for captures, exact text,
named-child sequences, wildcard limits and explicit semantic gaps.
