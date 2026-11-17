# Native structural tree patterns

A custom rule may select `pattern.tree` in place of the existing `kind` and
substring `text` predicates. This grammar-native object format is original. It
is not Semgrep configuration or source-template syntax. Applicable rules inspect
the original parsed source independently of clone filters and suppressions.

```json
{
  "id": "local/repeated-target",
  "message": "Review repeated delivery targets",
  "languages": ["javascript", "typescript"],
  "pattern": {
    "tree": {
      "kind": "call_expression",
      "children": [
        { "kind": "identifier", "text": "deliver" },
        {
          "kind": "arguments",
          "children": [{ "capture": "TARGET" }, { "capture": "TARGET" }]
        }
      ]
    }
  }
}
```

This reports `deliver(primary, primary)` and leaves
`deliver(primary, fallback)` alone. Comments and strings containing those calls
are not call expressions. Grammar node kinds differ by language; inspect them in
a trusted library plugin's temporary syntax tree. The twelve bundled Tree-sitter
modes support this API. The CMake adapter emits `unsupported-analysis` for
applicable tree rules and prevents complete baselines.

Every pattern node needs at least one constraint or capture:

| Field              | Contract                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `kind`             | Exact named syntax-node kind; at most 128 ASCII name characters                                        |
| `text`             | Exact complete raw node text, including internal whitespace, quoting and escapes; empty text permitted |
| `capture`          | Uppercase name beginning with A–Z, followed by A–Z, digits or underscores; at most 64 characters       |
| `fields`           | Exact grammar-field constraints, including unnamed operator tokens; every named field must exist       |
| `children`         | Ordered named children after excluding comment nodes; absent means any children, `[]` means none       |
| `{ "rest": true }` | Standalone child-list entry matching zero or more named children; at most one per list                 |

Nodes may also contain `all`, `any` and `not` filters. `all` requires every clause
to match; `any` requires at least one; `not` excludes a matching clause. Each
clause inspects the same candidate node, including an anonymous token selected
through a grammar field. These operators do not search descendants, ancestors,
overlapping ranges or other files. `all` and `any` require 1–128 patterns; `not`
requires one pattern. A sequence wildcard is valid only in a `children` list.

The node's kind, text, capture, fields and children run before its filters. Every
filter clause inherits a separate copy of those captures. A clause can compare
against inherited names and bind temporary local names, but those new bindings
never escape to the parent, sibling clauses or later filters. This scope keeps
Boolean truth values independent of clause order. `all` and `any` short-circuit
in array order; a failed branch cannot leave bindings behind. Nested filters
follow the same rule. There is no search for alternative capture assignments.

For example, `{ "kind": "call_expression", "any": [
{ "fields": { "function": { "text": "primary" } } },
{ "fields": { "function": { "text": "secondary" } } } ],
"not": { "fields": { "function": { "text": "secondary" } } } }` reports
`primary(item)` and excludes `secondary(item)` and `archive(item)`. See the
[executable filter example](../examples/code-quality/tree-predicates/README.md).

A capture binds one subtree within one candidate and rule. Repeated names require
the same node-kind/child structure and exact leaf text after removing comments.
Whitespace between tokens is immaterial. Operator kinds, literal spelling,
identifier spelling and nested structure remain significant. This is syntactic
equality; it does not resolve bindings, aliases, types, values or effects.
Captures are not interpolated into messages or included as source text in reports.

The wildcard anchors the prefix and suffix of its own child list. It cannot
cross a tree boundary or match statements in another block. Captures on either
side must still agree. There is no backtracking or alternative wildcard split:
all extra children belong to the single wildcard. Punctuation is not a named
child. Select an anonymous operator through a grammar field instead, for example
`{ "kind": "binary_expression", "fields": { "operator": { "text": "+" },
"left": { "capture": "VALUE" }, "right": { "capture": "VALUE" } } }` matches
same-operand addition while excluding subtraction. Field names are grammar-specific;
a missing field does not match. Field constraints share captures with child lists.
A field capture may bind a named subtree or an unnamed token.

Patterns use plain JSON objects. Malformed patterns fail before analysis. Mixing tree and legacy predicates,
unknown fields, root wildcards, wildcard captures, more than one wildcard per
list and invalid capture names are errors. Per-rule limits are 512 nodes,
32 levels, 128 entries per child list and 32 fields per node. Field names contain
at most 64 ASCII name characters. String fields are at most 4096 UTF-16
units. All tree rules share 10,000 pattern nodes and 64 KiB of string values per
configuration. Cycles hit the same finite depth/size refusal.

Every source file shares a five-million-unit comparison budget across applicable
tree rules and candidates. Candidate checks, child/field inventories, capture
structure walks and each UTF-8 byte hashed for capture equality consume it. The existing parser, traversal, input-byte and
finding-count budgets also apply. Exhaustion throws; it cannot produce a complete
passing report. The finite probe in
[tree-pattern-budget.mjs](../experiments/code-quality/tree-pattern-budget.mjs)
checks shared candidate/capture work and an end-to-end 12,000-statement refusal
with a 128 MiB heap and bounded stack.
Predicate visits and inherited capture-map entries also consume the shared
comparison budget. Boolean nodes count toward the same configuration depth,
node and metadata limits. The additional
[predicate probe](../experiments/code-quality/tree-predicate-budget.mjs) bounds
these operations and verifies a finite end-to-end refusal with the same limits.

Enabled tree rules add `named-tree-patterns-v1` to the method fingerprint;
legacy-only methods and findings retain their existing behavior. Changing a rule
or introducing tree rules crosses a baseline method boundary and requires a
reviewed migration. CLI, typed library, HTTP, JSON/text/SARIF and installed-package
consumers use the same matcher. See the
[original delivery example](../examples/code-quality/tree-patterns/README.md).
Enabled filters additionally record `isolated-candidate-filters-v1`; methods
without predicates retain their previous identities. Adding or changing filters
requires a reviewed baseline migration.

No constant propagation, type/import equivalence, dataflow, taint, Semgrep range
intersection or binding semantics, typed/list captures, source templates, automatic fixes or
complete Semgrep rule/case parity is implied. Those remain incomplete acceptance
criteria in the strict readiness inventory.
