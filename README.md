# CodeRail

## Table of contents

- [Development](#development)
- [Shipping releases](#shipping-releases)
- [Packaging distributions](#packaging-distributions)
- [License](#license.md)

## Development

Deno remains the application runtime, compiler, test runner, and authoritative type checker.
Bun is used only for style tooling; no package installation or `tsconfig.json` is needed.

`bun lint` currently requires **Bun canary**. Stable Bun 1.4.4 has `bun fmt`, but no `bun lint`.
This configuration was verified with the globally installed `1.4.4-canary.1+b9f2ec363` from the
[official canary release](https://github.com/oven-sh/bun/releases/tag/canary).
Install that build on your PATH (or use `bun upgrade --canary` to update an existing installation).
Check `bun --revision` and `bun lint --help` before running the style commands.

| Command | Purpose |
| --- | --- |
| `bun fmt src tests tools` | Format TypeScript in `src`, `tests`, and `tools` with Bun |
| `bun fmt --check src tests tools` | Check formatting without writing files |
| `bun lint src tests tools` | Check Bun lint rules and formatting without writing files |
| `bun lint --fix src tests tools` | Apply Bun lint fixes, including missing braces and formatting |

Bun uses 4 spaces, single quotes, semicolons, trailing commas, LF newlines, and a 100-character
line width. Defaults supply semicolons, trailing commas, and LF. `curly = ["error", "all"]`
requires braces for every control-flow body, and `bun lint --fix` inserts them. See Bun's
[curly rule](https://bun.com/docs/lint/rules/eslint/curly) and
[formatter configuration](https://bun.com/docs/format). `bun/format`
checks and fixes formatting during linting, so a separate formatter pass is unnecessary.
`cr verify` also uses Bun's combined lint/fix pass before its existing Deno tests and coverage.

The old explicit Deno lint rules have Bun equivalents, including explicit return types, no `any`,
unused variables, restricted-name shadowing, sparse arrays, and optional-chain assertions.
Bun's return-type rule allows function expressions to match the previous Deno policy.
`consistent-type-imports` preserves type-only import checking without resolving modules.
The existing fallthrough exception is preserved. Additional recommended Deno checks absent from
Bun's defaults are enabled explicitly in `bunfig.toml`.

Bun alone handles linting. Deno's deprecated API, versioned import, sloppy import, legacy import
assertion, triple-slash reference, empty enum, and `window` rules have no direct built-in Bun
equivalents and are not retained. Deno's type checker still catches invalid globals, unresolved
imports, syntax and type errors, including `await` in synchronous functions; it does not replace
all of those lint policies. Bun's syntax-only type import rule does not fully replace Deno's
`verbatim-module-syntax` export checking. Type-aware rules are intentionally avoided.

Bun recognizes `eslint-disable-next-line` comments using Bun's rule names. Existing intentional
exceptions use `@typescript-eslint/no-non-null-assertion` and `no-control-regex` suppressions.
Both rules remain enabled. Deno-specific ignore validation is gone; Bun validates its own
suppression comments.

Bun's type-aware checks and import-resolution rules are not enabled. `no-undef` is disabled;
Deno checks globals and resolves `deno.json` mappings, `jsr:` specifiers, and URL imports.
Bun parses these imports without executing or resolving them. No extra npm tooling is added;
the existing Deno-managed `npm:oxc-parser` dependency is unchanged.

Run application checks with Deno:

```sh
deno check src/**/*.ts tests/**/*.ts tools/**/*.ts
deno test -A
```

This migration intentionally does not reformat existing code. Style checks will report existing
formatting, missing-brace, and other lint violations until those files are fixed. Bun does not
reproduce Deno's case-insensitive named import/export sorting; its optional full import sorting is left off
to avoid reordering import declarations. Use the same Bun build locally and in CI to keep output
consistent. No CI configuration currently exists in this repository.

## Shipping releases

Run application tests before shipping. From a clean `main` synchronized with `origin/main`,
choose one version bump:

```sh
deno run -A tools/ship.ts patch
deno run -A tools/ship.ts minor --dry
deno run -A tools/ship.ts --help
```

`major` resets minor and patch, `minor` resets patch, and `patch` increments patch.
Ship fetches origin, checks main and the target tag, updates `src/cli/version.ts` and
`CHANGELOG.md`, then commits, tags `vX.Y.Z`, and atomically pushes main and the tag.
There is no force option or fallback to separate pushes.

Author entries under `Unreleased` first: the initial empty changelog blocks shipping.
Ship never generates entries from commits. It moves entries into a dated release section
(UTC) and updates tag/comparison links. If the computed version already has a section,
the entire changelog stays byte-for-byte unchanged; the version bump and Git steps still run.

`--dry` runs the same preflight, including fetch, and writes the actual preparation edits
unstaged. It creates no commit, tag, or push and does not predict push or publication success.
Inspect the edits, then reset them before repeating the original release with normal ship;
a subsequent invocation rejects the dirty checkout. For example, after reviewing dry edits:

```sh
git restore -- src/cli/version.ts CHANGELOG.md
deno run -A tools/ship.ts minor
```

Ship ends after the push. GitHub Actions owns compilation, package checks, and publication;
application tests do not gate CI publication. Ship runs no application tests and does not
wait for CI. On failure, it reports the failed step and retains any local edits, staged
files, commit, or tag already created. Inspect local and remote state and resolve it manually
before shipping again. Ship performs no rollback, cleanup, retry/resume, or tag movement.

## Packaging distributions

Use **Deno 2.9.8**, pinned in `tools/internal/package-options.ts`, on local builders and in both release
workflows. From the checked-out release revision, package one target:

```sh
deno run -A tools/package.ts --target x86_64-unknown-linux-gnu --version 0.1.0 --commit <full-sha> --output /tmp/coderail-packages
deno run -A tools/package.ts --help
```

All four options are required. The commit must be the full lowercase 40-character HEAD
SHA. Stable versions use canonical X.Y.Z and must match `src/cli/version.ts`; use
`--version canary` for canaries, whose metadata identifies the exact commit while the
executable continues to report the source version. Tracked inputs must be clean.
Compilation uses a disposable checkout of that commit, excluding untracked and ignored
files. Existing output names are rejected. Git and the pinned Deno compiler must be on
the builder; Deno downloads target runtimes on first use.

Supported targets are `x86_64` and `aarch64` for `unknown-linux-gnu`, `apple-darwin`,
and `pc-windows-msvc`. Each invocation writes `coderail-<target>.zip` and
`coderail-<target>.zip.sha256`. The sidecar is exactly lowercase SHA-256, two spaces,
archive basename, and a trailing newline. The classic ZIP contains `cr` (`cr.exe` on
Windows), `build.json`, and optional flattened `instructions/` and `templates/`.
Metadata is exactly `{schemaVersion:1,version,commit,target}`. Missing or empty source
resource directories are omitted; nested nonempty files are preserved. Links, special
files, unsafe names, empty resource files, and incompatible archives fail validation.
No placeholder resources are added.

Before outputs are written, the tool checks the checksum, executable architecture,
metadata, ZIP layout, and size/path limits through the existing upgrade staging consumer
using an in-memory GitHub transport. Recheck collected artifacts offline with the same
identity options:

```sh
deno run -A tools/check-package.ts --target x86_64-unknown-linux-gnu --version 0.1.0 --commit <full-sha> --output /tmp/coderail-packages
```

Stable and canary publishers must collect and successfully check **all six archives and
all six sidecars for the same revision and channel** before creating a public release.
These tools do not publish or run application tests. A failed step exits unsuccessfully;
inspect any output files manually before rebuilding into a fresh output directory.
Application tests remain the maintainer's responsibility before shipping.

Run focused contracts and opt-in real compiler acceptance separately:

```sh
deno test -A tests/tools/package.test.ts
CODERAIL_PACKAGE_ACCEPTANCE=1 deno test -A tests/tools/package-real.test.ts
```

Acceptance uses disposable source repositories and installation roots. It builds the real
application for all six targets, checks every archive with the production staging consumer,
and exercises stable and canary identities. On the matching host it runs executable version
and initialization checks, first installation, repeat installation, and upgrades to absent
resource sets while preserving personal resources. A compiled probe of the production
runtime context checks flattened resource lookup before and after upgrade. Harness connector
installation is currently unimplemented and is outside this smoke coverage.

Cross-compilation and header checks do not establish runtime execution. The downstream
stable/canary workflows must schedule this native smoke coverage on matching Linux,
macOS, and Windows runners for both architectures. The current application module graph has
no native npm dependencies; `oxc-parser` is a development-tool dependency. If native npm
imports enter the application graph, verify target-specific bindings with those matching
runners as well as compilation. Deno's cross-compilation interface is documented in the
[official compile reference](https://docs.deno.com/runtime/reference/cli/compile/).

Maintainer commands (`ship.ts`, `package.ts`, and `check-package.ts`) live directly in
`tools/`. Workflow scripts, verification helpers, and import-only modules live in
`tools/internal/`.

## Stable publication

After ship pushes `vX.Y.Z`, `.github/workflows/release.yml` resolves the pushed
lightweight or annotated tag to its full commit and checks its version constant and
versioned changelog section. It builds on six matching native runners using Deno 2.9.8:
Linux x86_64/ARM64, macOS Intel/ARM64, and Windows x86_64/ARM64. Each runner checks the
real archive, executable version, flattened runtime resource lookup, first installation,
and a subsequent upgrade using a disposable canary archive. Windows ARM64 uses the
public-repository `windows-11-arm` runner; unavailable runners block publication rather
than waive runtime checks. See the [GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

The collection job requires every build to succeed and all six archives plus six
checksum sidecars to pass the current upgrade staging consumer. The publishing job
repeats these checks, refuses an existing release, creates a public stable release
for `pavelmudroch/coderail` with the exact full `target_commitish`, and uploads exactly
twelve assets. It creates the release without making it latest, validates the complete
remote asset list, then looks up the designated latest release and promotes only if the
new stable version is numerically newer, or no latest exists. An older maintenance
release remains public without becoming the default. Notes come only from that commit's
versioned changelog section. Publication jobs across version tags share a concurrency
group covering upload, validation, latest lookup, and promotion. Builds can finish in
any order; GitHub may replace a pending job with a newer pending job. A skipped,
cancelled, or failed publication cannot promote without passing these checks. Do not run
the publisher concurrently outside the workflow.
Only the publication job has `contents: write`. No application-test result, draft stage,
or manual approval is a prerequisite; run application tests before shipping.
The [GitHub Releases API](https://docs.github.com/en/rest/releases/releases) defines
public creation and the separate asset upload operations.

From a clean checkout of a tagged revision, run the same local checks without publication:

```sh
deno run -A tools/internal/release.ts identity v0.1.0 <full-sha>
deno run -A tools/internal/smoke-package.ts --target x86_64-unknown-linux-gnu --version 0.1.0 --commit <full-sha> --output /tmp/coderail-packages
deno run -A tools/internal/release.ts check v0.1.0 <full-sha> /tmp/coderail-packages
deno test -A tests/tools/release.test.ts
```

Use the host's matching target for smoke checks. Package all six targets into the
collection directory before the final check. These commands do not access the release
API. Publication uses `tools/internal/release.ts publish <tag> <full-sha> <directory>` with
`GH_TOKEN`; the normal path is the tag-triggered workflow.

Creation and upload are separate operations, so a release can be visible temporarily
with missing assets. A failed upload can leave a permanently incomplete public release.
Upgrade refuses missing or changing assets before changing the installation; it does
not fall back to an older release or automatically retry. The publisher reports the
failed step, release identity, and confirmed upload count, retaining remote state.
Creation failures can also be ambiguous if GitHub accepted a request before a connection
failed. Inspect the tag, release, workflow logs, and assets manually. Existing releases
are errors; rerunning publication does not overwrite assets. There is no automatic
cleanup, tag movement, or resume command. To intentionally roll back the default,
select the desired complete stable release as latest in GitHub. A later newer successful
publication may promote itself again. Promotion failures also retain the public release;
inspect its assets and latest designation before manual recovery.

Resolve failed local/remote state manually, then make a fresh normal ship from clean
`main` synchronized with `origin/main`, using an unused next version tag and applicable
authored changelog entries. A failed publication may already have finalized its changelog
section; preserve that history and author entries for the next release as needed.
Ship preserves an already-finalized section for its computed version byte for byte.
Do not treat a missing asset or failed job as authorization to move a published tag.

## Canary publication

Every push to `main` starts `.github/workflows/canary.yml` for the resulting event
tip, including pushes containing multiple commits. All six native runners compile
that exact full SHA using Deno 2.9.8 and package version `canary`. Compilation,
archive/checksum validation through the upgrade consumer, and native executable,
resource lookup, first-install and upgrade smoke checks must all succeed. There is
no application-test gate or manual approval: a canary can be functionally broken
even when these required checks pass. The executable reports its source version;
`build.json` and `libexec/cr-canary-<full-sha>` distinguish canary source revisions.

Only publication holds the repository's `canary-publication` concurrency group,
with `cancel-in-progress: false`. Builds can finish in any order; pending publishers
may be superseded. Inside the lock, the helper rechecks all twelve files and reads
authoritative remote `main` before replacement, tag movement, public creation,
each upload, and completion. An old event tip is refused even if its build finishes
last. A push during publication stops further mutations at the next freshness check.
An in-flight API call can still complete after a push; the lock keeps the newer
publisher waiting until the old publisher finishes. Freshness is not an atomic
transaction with branch updates, and publication may temporarily expose a stale or
incomplete canary. The [GitHub concurrency rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
describe serialization and pending-job replacement.

The publisher deletes the prior rolling release, moves or creates only the dedicated
`canary` tag, creates a public `draft:false`, `prerelease:true` release with the full
source SHA as `target_commitish`, then uploads twelve assets. Check/build failures
leave the previous canary intact. Once replacement starts, API failures or a new
push can leave the canary absent or publicly incomplete. Upgrade rejects missing,
checksum-invalid or changing assets before installation mutation, without fallback
or retry. Consumers use `cr upgrade --canary`.

Failures report the step, remote identity when known, and confirmed upload count.
There is no automatic cleanup, rollback, or upload resume; a publication that already
targets the same SHA is refused, including an incomplete one. Inspect the workflow,
release, tag and assets manually before recovery. A successful later main tip can
replace the rolling canary normally; it does not resume the failed publication.
Do not manually cancel an active publisher or run `tools/internal/canary.ts publish` outside
the workflow's lock. For manual recovery, first stop scheduling new publication and
establish that publishers and their outstanding API requests have finished before
changing remote state. Only the canary tag is disposable; stable tags remain fixed.

Offline checks require a clean checkout of the intended event tip and all six packages:

```sh
deno run -A tools/internal/canary.ts check <full-sha> /tmp/coderail-packages
deno test -A tests/tools/canary.test.ts tests/tools/release.test.ts
CODERAIL_PACKAGE_ACCEPTANCE=1 deno test -A --filter 'real canary:' tests/tools/package-real.test.ts
```

The acceptance check compiles two native canaries from disposable source commits,
stages them with fake transport, and exercises installation and optional-resource
upgrade without publishing anything.

## License

[AGPL-3.0-or-later](LICENSE)
