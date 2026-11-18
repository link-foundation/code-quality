# Reviewed glob dependency patch

On 2026-11-17 the third candidate's [Security run](https://github.com/link-foundation/code-quality/actions/runs/44140636655)
reported [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
in both npm locks. The preserved log identifies the example audit at line 372 and
the root audit at line 3768. CodeQL passed. No patched release of the original
picomatch package was available during this investigation; audits remain enabled
at their existing thresholds.

Both manifests now override picomatch with the exact npm alias
`npm:@ryotsu/picomatch@4.0.7-a`. This development dependency's
[upstream source revision](https://github.com/ryotsu-kankichi/secured-picomatch/tree/3ab5a7627d480259e3d9ca67fbc14c125d374f0e)
and published archive were reviewed. Its SHA-512 integrity is
`JroBFEmaejC7szGSfqOhF1QZHLKvX2wTA1+fWyfkpy3BjzdQKNPLKa2FtgeKVUDy5/UPUNkXEeCHJ5ZRBMLTVA==`.
The archive contains ten files and 69,152 unpacked bytes, no dependencies and no
install hooks. Reviewed source blobs for parse.js, constants.js, package.json and
LICENSE match that immutable Git revision. `npm audit signatures --json` in an
isolated one-dependency workspace reports no invalid or missing signatures;
`experiments/code-quality/verify-glob-provenance.mjs` reproduces that check.
The published provenance names the same source commit and its GitHub publish run.

The parser patch removes an ambiguous outer repetition when the branch language
is closed under concatenation; unsupported complex wildcard repetition is treated
literally. It also changes POSIX punctuation escaping and negation, newline
handling in globstar and a bracketed globstar path case. This is a compatibility
tradeoff: exotic extglob capture groups and unsupported complex wildcard branches
can behave differently. Repository patterns do not use those constructs. Do not
set `maxExtglobRecursion: false`, which disables this safeguard. The package
retains its MIT license; original engine code remains Unlicense.

The original regression experiment executes finite 32-character failing inputs
for `+(*a)` and `+(*)b` in separate Node processes, each with a 64 MiB V8 heap,
512 KiB stack and five-second process-group deadline. The former installed
picomatch 4.0.7 exceeds that deadline on the first case; the reviewed package
finishes all twelve negative, positive and repository-pattern cases.
`tests/glob-security.test.js` checks this behavior and every committed affected
npm/Deno resolution and integrity. The two npm audits report no advisories.

Deno 2.9.7 retained its old dependency graph after adding the override. A fresh
independent lock calculation established the six affected graph records; only
those records, the new package integrity and the workspace override were adopted.
Every unrelated version and integrity was preserved. A frozen install passes and
`deno why npm:@ryotsu/picomatch` resolves the Changesets, lint-staged and tinyglobby
paths to the patched alias. Full cross-platform CI still validates each exact
candidate revision; a local audit alone does not certify the entire PR.
