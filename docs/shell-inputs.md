# Shell workspace inputs

Shell controls, coverage and mutants must observe the same project inputs. The
engine fingerprints every regular file copied into a mutant workspace, including
helper data, unselected shell helpers and file permissions. It checks that tree
after each measurement stage and after tool verification. Adding, deleting or
changing a helper refuses a score, even when the selected source and test bytes
remain unchanged. Selected source/test checks retain their specific diagnostics.

The recorded `measurement.workspace` contains the tree's SHA-256, file count and
total bytes read. The digest uses sorted relative paths, entry types, permissions,
file sizes and file hashes. It excludes timestamps and machine-specific inode
identities. The method records `bounded-input-tree-sha256-v1`; older shell
baselines require a reviewed migration and fresh complete measurements. Input
content is measurement evidence rather than a method identifier, so intentional
source/test improvements can still raise compatible floors.

Inventory and copying share these exclusions at any directory depth: `.git`,
`node_modules`, `target`, `dist`, `coverage` and `quality-reports`. The CLI also
excludes its chosen report directory. The library's `excludedPaths` array accepts
up to 1,000 portable root-relative path prefixes for generated output. Excluding
a selected script or Bats test is an error. Files outside this tree can still be
used by trusted project code; they are not covered by this digest.

The tree is limited to 2,000 files, 32 MiB of file bytes, 100,000 visited entries
and 4 MiB of metadata. Each file is hashed in 64 KiB chunks. Both declared sizes
and actual bytes read are bounded. Symlinks and special files are refused before
project execution; existing dependency/build exclusions remain shared with mutant
copying. No cache or dependency tree is removed by validation.

Tests that generate files in the project should use an excluded output directory
or a separate temporary directory. Rewriting a helper with identical bytes and
permissions is allowed. These repeated observations are consistency checks for
trusted code, not a sandbox against deliberate changes restored between checks.

`tests/quality-shell-workspace.test.js` reproduces replacement, addition, deletion
and unselected-helper changes with small injected controls. The first four cases
failed before the fix because no rejection occurred. The positive case preserves
the original 66.66 assertion. A sparse oversized helper verifies refusal before
external execution without allocating or writing a large payload.

`experiments/code-quality/workspace-freshness.mjs` executes a real passing Bats
control that changes a helper text file. QA refuses a score and preserves source
bytes. The existing real-shell CI probe runs this refusal on both native Linux
architectures alongside all twelve passing measurement checks.
