# Repeated CMake arguments

Run from the repository root:

```sh
node bin/code-quality.js check examples/code-quality/cmake-clones --config examples/code-quality/cmake-clones/quality.json --format json
```

The command exits 1 and reports the shared nine-token parameter/body block in
`first.cmake` and `second.cmake`. The function names differ. Each whole argument
is one lexical token; comments and whitespace between arguments do not count.
This analysis does not execute CMake or expand variables. See the
[token contract](../../../docs/token-clones.md).
