---
title: Uninstall managed harness payloads
status: closed
depends-on: 0004, 0006
reason: done
duplicate-of: 
---

# Uninstall managed harness payloads

Add manifest-driven `cr uninstall <harness> ...` so only files still owned by the selected harness can be removed and edits survive unless explicitly approved.

## Tasks

1. [x] Add uninstall command and ownership fixtures
2. [x] Parse uninstall options and prepare manifest-only removal
3. [x] Apply protected removal and release ownership

## Task details

### 1. Add uninstall command and ownership fixtures

Add executable POSIX-shell tests at `tests/commands/uninstall.test.sh` and extend the lifecycle test. Cover absent and empty manifests, unchanged and absent managed files, edited regular files and links, unrelated user files, unsafe metadata, no force, `--yes`, interactive Yes/No/default force decisions, and `--force --yes`.

Expected outcome:

- Missing manifest reports a successful no-op; an existing invalid manifest fails without mutations. Tests prove uninstallation succeeds without reading the current bundle or calling the renderer.
- An edited preserved file becomes user-owned, and the last released record removes that harness's manifest while leaving unrelated metadata and user directories intact.

Validation:

- Run the uninstall and lifecycle tests directly with `sh` and assert bytes, ownership, and failure status.

### 2. Parse uninstall options and prepare manifest-only removal

Extend `lib/commands/uninstall.sh` with the same explicit harness names and `-h`/`--help`, `-f`/`--force`, `-y`/`--yes`, and `--` rules as install; keep `--self` reserved for its owning scope. Resolve and validate homes and manifest locations without creating any directory. Add a separate private `prepare uninstall` entry point that needs no renderer or bundle content and captures every needed confirmation before mutation.

Expected outcome:

- Repeated names are processed once in first-appearance order; unavailable required input fails preflight with guidance rather than becoming an implicit No.

Validation:

- Run `sh -n` and direct command fixtures for argument, home, and prompt handling.

### 3. Apply protected removal and release ownership

Remove unchanged recorded files and release absent records. Preserve edited files by default or after a declined prompt; delete an edited link only after approval and without following it. Stop on unsafe or changed target/parent state. Publish the manifest after each completed release, unlink it when no records remain, and leave unrelated files and nonempty directories alone.

Expected outcome:

- Successful preservation is reported without failing the command; only valid records ever authorize deletion.

Validation:

- Run direct uninstall and lifecycle fixtures and `./bin/cr test <changed-lib-paths>`.

## References

- [Installation specification](../../plans/coderail-v2-0/harness-installation-and-removal/harness-installation-and-uninstallation/SPEC.md)
- Tickets `0004-extend-harness-path-and-manifest-contracts`, `0006-reconcile-protected-harness-installations`
- `lib/commands/uninstall.sh`, `lib/commands/install/`
