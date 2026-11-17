# Optional annotation comparison

Run from the repository root:

```sh
node bin/code-quality.js check examples/code-quality/clone-filters --config examples/code-quality/clone-filters/quality.json --format json
```

The command exits 1 with one 17-token pair and one two-location group. Java
annotation names and arguments differ, while the retained class/method tokens
match. Setting `ignoreAnnotations` to false removes this full-block match at the
same threshold. Whole-function structural duplication is disabled in this example.

The annotations are original syntax fixtures; no framework or Java compiler is
required. Syntax validation and other rules still inspect complete source.
See [token filters and migration](../../../docs/token-clones.md).
