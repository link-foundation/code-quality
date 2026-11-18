# Expanded shell mutation example

From the repository root with Bash >=5.2 and Bats on PATH:

```sh
bats examples/code-quality/shell-expanded/operators.bats
node bin/code-quality.js mutation examples/code-quality/shell-expanded --mutation-policy standard --format json
node bin/code-quality.js mutation examples/code-quality/shell-expanded --mutation-policy expanded --format json
```

The original tests assert all four ordering results, but deliberately check only
whether the product is even. Standard generates one multiplication-to-division
mutant, which survives. Expanded also generates four ordering complements and a
multiplication-to-addition mutant; those five are killed, giving 5/6 (83.33%).
An assertion of the exact product would kill the remaining division mutant.
The different candidate denominators make these fixture observations rather than
an accuracy comparison.

No project build, compiler or kcov is needed for the independent mutation command.
Use full `qa` with ShellCheck and kcov for baseline creation. Selecting another
policy requires reviewed baseline migration. See [the policy contract](../../../docs/shell-mutations.md).
