# Importing a quality-bash baseline

Import preserves the published baseline's file inventory and numeric floors while
requiring a fresh, complete native shell QA measurement. It does not assume that
different coverage algorithms, parsers or mutation operators measure equivalent
behavior. Review those differences before choosing a migration explanation.

```sh
node bin/code-quality.js baseline-update ./project \
  --create --baseline-path quality-baseline.json \
  --import-quality-bash ./project/quality-bash-baseline.json \
  --migrate 'Reviewed independent operators, parser and rounding policy'
```

The source path is relative to the current directory. `--baseline-path` is
relative to the project root. The source remains unchanged. The destination must
not exist; an existing file, directory or symlink is refused before execution.
Import requires `--create` and a nonblank explanation of at most 900 characters;
it cannot be combined with `--baseline-ref`. Atomic exclusive creation also
protects against another process creating the destination during measurement.

The supported interchange contract is the public schema whose identifier is
`https://raw.githubusercontent.com/ever-guild/quality-bash/v1.0.0-alpha.3/baseline.schema.json`.
The v1.0.0-alpha.5 release carries the same schema bytes. Unknown schemas, fields,
missing values, duplicate file/operator entries and unsafe file paths are refused.
Source JSON must be a regular, non-symlink UTF-8 file of at most 1 MiB, with unique
object property names and at most 128 nested levels. Escaped aliases such as
`score` and `sco\u0072e` count as the same property. Working baselines, committed
Git baselines, configuration files and Action base-event JSON use the same
unambiguous JSON reader; committed baselines also retain their regular-blob check.

Fresh QA must cover exactly the imported source inventory and meet or exceed both
imported floors. Missing metrics or a weaker result refuse the import; stronger
fresh results become the new floors. The destination records the native method
fingerprint and an audit entry containing the explanation and SHA-256 of the
parsed source's `JSON.stringify` representation. This is a content reference to
the parsed source, not a hash of its original whitespace or a claim of equivalent
methodology. Keep the original baseline with the migration review.

The released quality-bash changelog describes rounding half up to two decimal
places. Native percentages round down to two decimal places. A result just below
an imported rounded floor therefore refuses migration until the fresh native
measurement meets that floor. Import never lowers a floor to accommodate rounding.
A failed import produces a fresh incomplete report bundle when reporting has
started; it does not overwrite previous evidence. Ordinary compatible native
baseline updates retain their monotonic floor checks.

The library exports `validateQualityBashBaseline` and `importQualityBashBaseline`
from `@link-foundation/code-quality/quality`. The latter returns validated native
baseline data; it performs no file write. Original schema, refusal and independent
measurement cases are in `tests/quality-baseline-import.test.js` and
`tests/quality-json.test.js`. Real-tool CLI migration and source/destination
preservation are exercised by `experiments/code-quality/real-shell.mjs` through
its baseline import fixture.
