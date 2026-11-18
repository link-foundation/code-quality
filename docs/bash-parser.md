# Bash grammar and runtime

Bash analysis uses the official Tree-sitter Bash 0.23.3 release WASM asset with
`web-tree-sitter` 0.24.7, installed under the exact npm alias
`web-tree-sitter-bash-runtime`. The other grammar-backed languages retain
`web-tree-sitter` 0.20.8 and `tree-sitter-wasms` 0.1.13. CMake retains its explicit
native adapter. These are syntax parsers; compiler/project semantics and complete
Bash semantic validation remain unfinished.

The old bundled Bash 0.20.5 grammar imports `isalpha`, which the old runtime does
not export. A valid `[[ word == word ]]` therefore throws before analysis. Merely
updating the runtime to 0.22.6 or 0.24.7 leaves that missing import. The official
Bash 0.23.3 asset imports wide-character classification functions available in the
compatible runtime. Original case patterns and heredocs also exercise its scanner.
No local grammar compilation is required.

The vendored asset is
[`src/quality/grammars/tree-sitter-bash.wasm`](../src/quality/grammars/tree-sitter-bash.wasm),
1,364,404 bytes, SHA-256
`d1844429a58620f306b6f42aebe92298243ca8120cd833a3ab5d87c7a2e7b9fd`.
It comes from the [official release](https://github.com/tree-sitter/tree-sitter-bash/releases/tag/v0.23.3)
at commit `487734f87fd87118028a65a4599352fa99c9cde8`. The release has no published
asset digest; this is our pinned observation of the HTTPS release artifact, not a
reproducible-build or independent publisher-signature claim. Its unchanged MIT
license ships beside it. `THIRD-PARTY-NOTICES.md` retains the earlier bundled
notices and identifies the replacement.

The loader checks SHA-256 before loading the grammar, caches one initialization,
uses the existing two-second parser deadline and always releases parser/tree
resources. Syntax traversal and descriptor budgets still apply. A corruption
regression uses a separate owned copy and requires refusal before callback use.
The language-specific runtime exposes named/missing node flags and current cursor
nodes as properties; the engine handles both runtime API forms. Plugin `root` is
an opaque grammar-specific object, as declared in the existing API; plugins that
inspect it need to account for this Bash runtime version.

Reports containing Bash add the exact grammar/runtime/artifact identity to their
method. Non-Bash methods and finding identities retain their preceding values.
Shell measurement methods also include the new grammar identity. Working and
committed baselines therefore require an explained migration with fresh complete
measurement; compatible floors cannot decrease. Evolution uses the corrected
syntax trees, so rerun extraction when comparing historical Bash abstractions.

`tests/quality-bash-grammar.test.js` covers original literal/variable/Unicode
patterns, case alternatives, quoted/indented heredocs, here strings, invalid
syntax, extraction, anonymous operator fields, clones, tree predicates, baseline
boundaries, corruption and CLI/HTTP. Installed-tarball smoke exercises the shipped
binary and mutation extraction. See the [original example](../examples/code-quality/shell-syntax/README.md).
The finite grammar and runtime probes live in `experiments/code-quality/`; runtime
probes use a 128 MiB JavaScript heap and bounded stack.

The separate original operator probe runs the checksum-pinned released
quality-bash alpha.5 CLI on a finite trusted fixture. This audits observable
candidates, not source or test-suite implementation. Remaining operator-policy
and full diagnostic parity gaps stay explicit in strict readiness.
