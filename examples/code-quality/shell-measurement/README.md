# Original measurement comparison fixtures

The positive test executes three of this function's five executable lines. The
negative branch prints its two characters separately, leaving both lines
uncovered. The test checks output; it deliberately does not assert exit status,
so changing the final return value can survive mutation testing.

Both fixtures are original; no quality-bash source or test fixture was read.
`numeric-condition` demonstrates a policy difference: native numeric-literal
mutation adds one candidate beyond the released CLI's comparison and return-code
candidates. `arithmetic` exercises a comparison, an arithmetic operator and a
return code, with two detected mutants and one survivor. Both measure 3/5 lines.
The bounded
`experiments/code-quality/shell-comparison.mjs` compares the independently
implemented engines with the same installed external tools. Explicit half-up
rounding produces 66.67 for 2/3; the native default remains floor at 66.66.
