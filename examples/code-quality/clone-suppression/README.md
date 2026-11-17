# Reviewed generated regions

Run from the repository root:

```sh
node bin/code-quality.js check examples/code-quality/clone-suppression --config examples/code-quality/clone-suppression/quality.json --format json
```

This original generated-table fixture exits 0 and records both omitted ranges in
`cloneSuppressions`. Without the explicit option, the duplicate token block fails
the gate. Actual comment markers affect token duplication only; syntax and other
rules still inspect the source. See the [token contract](../../../docs/token-clones.md).
