# Original Bash syntax example

`describe.sh` combines an unquoted pattern operand, a case label and a quoted
heredoc. The earlier bundled grammar calls an unavailable runtime function for
these inputs. The shipped official Bash 0.23.3 WASM grammar uses its own pinned
compatible runtime; no native compiler or tool download is needed for parsing.

```sh
node bin/code-quality.js check examples/code-quality/shell-syntax --format json
bats examples/code-quality/shell-syntax/describe.bats
```

The first command performs source analysis. The second executes the original
fixture using trusted installed Bash/Bats. Existing Bash analysis baselines need
an explained migration because the grammar and operator-node interpretation
changed. Other language methods remain unchanged.
