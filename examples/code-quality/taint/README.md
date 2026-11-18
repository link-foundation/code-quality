# Original source-to-sink example

From the repository root:

```sh
node bin/code-quality.js check examples/code-quality/taint --config examples/code-quality/taint/quality.json --format json
```

The command exits 1 with one `example/command-flow` finding in `unsafe.js`.
The trace connects `input.read()` to `raw`, the modeled `decorate` return,
`command` and the first argument of `execute`. `safe.js` passes because this
configuration explicitly trusts the return from `validateCommand`.

These files are original static-analysis inputs. The host-provided call names
are configuration models, not included implementations. The analyzer never
executes them or assumes that a function is a sanitizer from its name alone.
Validate each model against its real implementation before relying on a finding.

See [the native dataflow contract](../../../docs/dataflow.md) for supported
straight-line scopes, conservative parameter sources and explicit refusals.
