# Associative technology stack in Code Quality

The PR #2 review asked to use the
[associative technology stack](https://github.com/link-assistant/formal-ai/blob/main/docs/associative-tech-stack.md)
by default wherever it applies. This page lists each component, where Code Quality
uses it, and why some components stay out of the shipped runtime. The manifests and
source paths cited here are the source of truth.

| Component                               | Status                                                 | Where                                                     |
| --------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `links-notation` + `lino-objects-codec` | Direct runtime dependency (`lino-objects-codec@1.0.0`) | `src/quality/lino.js`, reports, config, HTTP              |
| `lino-arguments`                        | Development-time dependency                            | release and CI scripts through `scripts/use-module.mjs`   |
| `command-stream`                        | Development-time dependency                            | repository scripts (`scripts/run-command.mjs` and others) |
| `lino-i18n`                             | Demo website localization                              | `examples/demo-site`                                      |
| `@link-foundation/ui`                   | Demo website rendering                                 | `examples/demo-site`                                      |
| `meta-language`, `link-cli`, `doublets` | Not used at runtime                                    | see below                                                 |

## Links Notation as the interchange format

- `code-quality check|qa --format lino` prints the full report as Links Notation.
  `languages`, `rules`, `evolution` and `tools install` honor `--format lino` too.
- Every saved report bundle (`--reports`) contains `report.lino` next to
  `report.json`, `report.txt` and `report.sarif`.
- `--config quality.lino` loads canonical Links Notation configuration. Example:
  [examples/code-quality/taint/quality.lino](../examples/code-quality/taint/quality.lino).
- The HTTP API accepts `content-type: text/x-lino` request bodies. It returns
  Links Notation when the request sends `accept: text/x-lino`, and documents both
  media types in `/openapi.json`.
- Library: `formatLino(value)`, `parseCanonicalLino(text)`,
  `formatReport(report, 'lino')` and `linoMediaType`.

The codec round-trips reports losslessly: `parseCanonicalLino(formatLino(report))`
deep-equals the JSON report (see `tests/quality-lino.test.js` and
`experiments/code-quality/lino-roundtrip.mjs`).

### Why inputs must be canonical

`lino-objects-codec` keeps the last value of a repeated key, much like
`JSON.parse`. Code Quality already refuses duplicate JSON properties, because an
interchange or configuration input must have exactly one meaning. The parse tree
alone cannot detect the repetition: a list of single-key objects
(`[{ "call": "x" }, { "call": "y" }]`) has the same shape as an object with two
`call` keys. Instead, `parseCanonicalLino` re-encodes the decoded value and
requires the original lines, ignoring blank lines and trailing spaces. A repeated
key, a dropped line or an alternative spelling fails with an error that shows the
expected canonical text. Generate canonical files with `formatLino` or
`--format lino`.

## Demo site

The [browser demo](../examples/demo-site/README.md) uses the stack's UI layer.
The page is a Links Notation document rendered by `@link-foundation/ui`
(`ui-react` over `ui-dom`) with the `material3` Links Notation theme from
`@link-foundation/ui-themes`. Its strings are `lino-i18n` catalogues
(`src/locales/en.lino`, `src/locales/ru.lino`). It accepts the same canonical
`quality.lino` configuration as the CLI and can show reports as Links Notation.

## Defaults and compatibility

Human-readable text remains the default `check` output. JSON remains the default
for the machine-readable commands and the HTTP API, and SARIF stays available for
GitHub code scanning. These consumers (GitHub Actions, SARIF uploaders and
existing `evolution.json` users) require their formats, so switching the default
would break them. Links Notation is always produced in saved evidence bundles, and
it is the documented format for new configuration.

## Components not adopted in the runtime

- `lino-arguments`: the `code-quality` CLI keeps its strict parser, which refuses
  repeated options, unknown flags and commands. That parser has regression tests
  for the security boundaries of the tool and adapter options. `lino-arguments`
  would add `yargs`, `getenv` and `.lenv` ambient configuration to the runtime;
  implicit environment configuration could silently change a quality gate. It
  remains in use for repository scripts.
- `command-stream`: external adapters run through `src/quality/process.js`, with
  exact argv, byte budgets, timeouts, process-group termination and no shell.
  These are the boundaries the shell QA mutation and coverage tests depend on.
  `command-stream` remains the runner for repository scripts.
- `meta-language`, `link-cli` and `doublets`: analysis needs grammars for every
  language listed in the CI/CD best practices, so Code Quality uses pinned
  tree-sitter WASM grammars. It is a stateless analyzer and keeps no link store.
  Reports can be imported into a links store as `.lino` documents.
