# Repeated token block

Run from the repository root:

```sh
node bin/code-quality.js check examples/code-quality/token-clones --config examples/code-quality/token-clones/quality.json --format json
```

The command exits 1 and reports the common 22-token parameter/body block in
`first.js` and `second.js`. Their function names differ, so this is a partial
function match. JSON includes one `cloneGroups` entry with both occurrences,
alongside the original pair and finding. Whole-function structural duplication is disabled in this fixture
to show the token finding independently. See [the token contract](../../../docs/token-clones.md).
