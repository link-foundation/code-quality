# Downloaded shell tools and consumer Action

`code-quality tools install <new-directory>` downloads Bats 1.14.0,
ShellCheck 0.11.0 and Debian's kcov 43 build for Linux x64 or arm64. The
JavaScript library exports `installShellTools` and `shellToolManifest` through
`@link-foundation/code-quality/quality`. No sudo, native build or package
maintainer scripts run. The parent directory must already exist; an existing
destination is refused, even if empty. A failed install removes only the new
directory created by that call.

```sh
node bin/code-quality.js tools install /tmp/my-quality-tools > /tmp/quality-tools.json
export PATH="/tmp/my-quality-tools/bats/bats-core-1.14.0/bin:/tmp/my-quality-tools/shellcheck/shellcheck-v0.11.0:/tmp/my-quality-tools/bin:$PATH"
node bin/code-quality.js baseline-update ./my-shell-project --create
node bin/code-quality.js qa ./my-shell-project
```

The host supplies GNU Bash >= 5.2, tar, dpkg-deb, Python 3 and glibc >= 2.36.
Unsupported or unrecognized Bash versions fail before downloads or project
execution. The installer downloads the pinned Debian libraries for kcov,
including libcurl, libdw, libelf, libgcc, libstdc++ and their dependency closure.
It also downloads Debian's common license texts. It does not support musl.
The real acceptance workflow uses Ubuntu 24.04 on native x64 and arm64 runners.

Use the returned `executables.kcov` launcher, under `bin/`; calling the raw
`kcov/usr/bin/kcov` bypasses its private libraries. The relocatable launcher
passes a private `--library-path` to the host dynamic loader. Installation
refuses a directly linked dependency that resolves outside the private tree,
apart from glibc libraries. It clears `LD_LIBRARY_PATH`, `LD_PRELOAD` and
`LD_AUDIT` for that process tree. Tool-directory paths containing colon,
semicolon, dollar, CR or LF are refused because the loader interprets path
tokens. Spaces and quotes are passed literally. Project tests remain trusted
code; plugins, certificates, system configuration and host runtime behavior
are not a hermetic execution environment.

Every archive must match a repository-pinned SHA-256 before extraction. The
ShellCheck pins were independently matched to the release asset digests; gzip
and xz have different digests. Both kcov pins match Debian's
[amd64 package metadata](https://packages.debian.org/bookworm-backports/amd64/kcov/download)
and [arm64 package metadata](https://packages.debian.org/bookworm-backports/arm64/kcov/download).
The Bats archive includes only its executable, helpers and license in the
installation; its development tests and fixtures are not installed.

Library versions, archive digests, binary URLs and public-index provenance are
recorded in [the runtime metadata](case-studies/issue-1/data/shell-runtime-pins.json).
These pins were independently resolved from Debian's HTTPS package indexes;
they were not checked against a local Debian signing keyring. Every downloaded
package must match the committed digest before extraction. Only shared-library
files and license notices are retained from dependency packages. Internal
SONAME aliases become regular files; external links and special files fail.

The installer allows at most 32 MiB per compressed download, 4000 extracted
entries, depth 16, 64 MiB per file and 128 MiB total. Downloads and extraction
have a five-minute deadline. The archives are trusted, fixed upstream assets;
the extractor does not accept caller-provided URLs or archives. Installed
symlinks and special files are refused. `installation.json` records the
archive pins, installed file hashes, executable paths and loader resolution.
Doctor checks the entire managed tree before executing its tools. Changed or
missing helpers/libraries, added files and malformed receipts fail; an accepted
inventory fingerprint becomes part of the measurement method. Relocating an
unchanged tree preserves that fingerprint. Unmanaged tools still hash their
entry executables. This inventory is not a signature or verification of host
glibc or dynamically loaded plugins. Tools retain their upstream licenses and
source offers in `runtime/licenses/`, with package metadata in
`runtime/packages.json`.

The repository-root composite Action uses the same engine and locked
dependencies. Pin its `uses` reference to a reviewed commit when integrating
it. Source analysis is the default and does not execute project code:

```yaml
on: [pull_request]
permissions:
  contents: read
jobs:
  quality:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
          persist-credentials: false
      # After this PR is integrated, replace the ref with its reviewed commit.
      - uses: link-foundation/code-quality@issue-1-f401f7eb3981
        with:
          command: check
```

For shell QA, set `command: qa`. This executes trusted project tests as the
runner user, installs the pinned tools into an owned runner temporary
directory, and removes that installation after the measurement. With
`install-tools: 'false'`, provide the tools on PATH yourself. QA refuses
`pull_request_target`. Projects must commit a measured baseline before
enabling the gate. During `pull_request`, the Action automatically enforces
the exact base commit's baseline in addition to the working baseline;
`fetch-depth: 0` supplies that commit. Missing or malformed base evidence
fails. `enforce-base: 'false'` explicitly disables this additional comparison.

Inputs include root-relative `root`, `baseline` and `reports`, `jobs` (auto
or 1–4), and `timeout-ms` (1–300000). A symlinked root resolving outside the
workspace is refused. Arguments are passed directly to JavaScript and
subprocess argv, without interpolating input into a shell command. Outputs
`reports` and `manifest` identify the report directory and `latest.json`;
upload that directory with an `if: always()` artifact step if desired. A
tool-installation failure publishes a fresh incomplete report and preserves
older bundles. The Action does not create baselines, publish reports or
comment on pull requests.
