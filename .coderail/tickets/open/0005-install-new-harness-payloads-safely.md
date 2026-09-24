---
title: Install new harness payloads safely
status: open
depends-on: 0003, 0004
---

# Install new harness payloads safely

Implement the first-install path from a complete rendered tree into one selected harness home, including public install command parsing, home validation, collision protection, and initial ownership records.

## Tasks

1. [ ] Add first-install command and lifecycle fixtures
2. [ ] Parse install options and validate selected homes
3. [ ] Stage, preflight, and apply a fresh harness installation

## Task details

### 1. Add first-install command and lifecycle fixtures

Add executable POSIX-shell tests at `tests/commands/install.test.sh` and extend `tests/commands/install/harness_lifecycle.test.sh`. Use fixture bundles, the renderer, and disposable homes.

Expected outcome:

- Tests cover required and invalid names/options, `--`, repeated names, help, configuration precedence, default-home creation at application, existing custom homes, unsafe ancestry, all four rendered layouts, generated configuration ownership, unreadable or unsafe stage entries, and unmanaged collisions even when bytes match.
- A stage or preflight failure leaves destination files and manifests unchanged; a successful install records checksums and lengths of installed bytes and preserves executable modes.

Validation:

- Run the focused tests directly with `sh` and check usage versus ordinary error status.

### 2. Parse install options and validate selected homes

Extend `lib/commands/install.sh` for explicit `codex`, `claude`, `copilot`, and `gemini` names, `-h`/`--help`, `-f`/`--force`, `-y`/`--yes`, and `--`. Deduplicate names in first-appearance order. Resolve homes through the existing configuration loader and environment overrides. Reject links, non-directories, ambiguous or unsafe action roots and ancestors before accessing managed paths; create a missing default home only during successful application.

Expected outcome:

- Missing or conflicting arguments use the existing usage error; configured and overridden homes follow the loader's existence rule. `--force` and `--yes` are accepted for later refresh behavior but grant no authority over unmanaged collisions.

Validation:

- Run `sh -n` and direct command fixtures for parsing and home safety.

### 3. Stage, preflight, and apply a fresh harness installation

Add private lifecycle preparation and application entry points under `lib/commands/install/`. Call `harness_render` into an isolated temporary stage outside selected homes, inventory its regular files in `LC_ALL=C` order, and independently validate every relative path, source, parent, target, and metadata location. For a selected harness without a manifest, reject any existing target as unmanaged, including byte-identical files, links, directories, and special entries. Create files with same-directory temporary files and rename; publish each completed ownership snapshot atomically, using `path_checksum` on installed bytes.

Expected outcome:

- No installed state changes before stage and preflight succeed; partial application errors stop immediately and leave truthful prior manifest snapshots.

Validation:

- Run `sh -n` on changed scripts, the direct install and lifecycle tests, and `./bin/cr test <changed-lib-paths>`.

## References

- [Installation specification](../../plans/coderail-v2-0/harness-installation-and-removal/harness-installation-and-uninstallation/SPEC.md)
- [Renderer handoff](../../plans/coderail-v2-0/harness-installation-and-removal/harness-instruction-and-skill-rendering/SPEC.md)
- Tickets `0003-render-harness-agent-definitions`, `0004-extend-harness-path-and-manifest-contracts`
- `lib/commands/install.sh`, `lib/commands/upgrade/internal_install.sh`
