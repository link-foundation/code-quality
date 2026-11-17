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
export PATH="/tmp/my-quality-tools/bats/bats-core-1.14.0/bin:/tmp/my-quality-tools/shellcheck/shellcheck-v0.11.0:/tmp/my-quality-tools/kcov/usr/bin:$PATH"
node bin/code-quality.js baseline-update ./my-shell-project --create
node bin/code-quality.js qa ./my-shell-project
```

The host supplies Bash, tar, dpkg-deb, Python 3, glibc >= 2.34, libcurl,
libdw, libelf, libgcc, libstdc++ and zlib with their transitive dependencies.
The installer does not download shared libraries or support musl. It checks
each executable's reported version and refuses a missing runtime. The real
acceptance workflow uses Ubuntu 24.04 on native x64 and arm64 runners.

Every archive must match a repository-pinned SHA-256 before extraction. The
ShellCheck pins were independently matched to the release asset digests; gzip
and xz have different digests. Both kcov pins match Debian's
[amd64 package metadata](https://packages.debian.org/bookworm-backports/amd64/kcov/download)
and [arm64 package metadata](https://packages.debian.org/bookworm-backports/arm64/kcov/download).
The Bats archive includes only its executable, helpers and license in the
installation; its development tests and fixtures are not installed.

The installer allows at most 32 MiB per compressed download, 4000 extracted
entries, depth 16, 32 MiB per file and 128 MiB total. Downloads and extraction
have a five-minute deadline. The archives are trusted, fixed upstream assets;
the extractor does not accept caller-provided URLs or archives. Installed
symlinks and special files are refused. `installation.json` records the
archive pins, installed file hashes and executable paths. This inventory
describes the installed tree; it is not a signature or verification of host
shared libraries. Tools retain their upstream licenses and source offers.

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
