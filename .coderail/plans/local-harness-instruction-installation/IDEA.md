---
title: "Local harness instruction installation"
status: "archived"
---

## Outcome

Add `--local` to `cr install` and `cr uninstall` to manage harness instructions
within the selected project.

## Confirmed decisions

- Resolve the project through existing repository-root discovery, honoring global
  `--cwd`. Invocation from a subdirectory targets the discovered project root.
- Require an initialized project for local operations: the nearest ancestor with
  a `.coderail` directory. If none exists, fail with guidance to run `cr init`.
- The local installation manifest is stored locally and separately from the
  global installation manifest.
- Connectors must know whether the operation is global or local. Their home
  depends on that scope; instruction locations may also differ by scope.
- Bind the installation target in each connector's constructor. A global target
  identifies global scope; a local target also includes the resolved project
  root. Home and all translations use that same immutable target.
- `Harness.get(name, target)` constructs the appropriate connector directly.
  Remove the named `Harness.codex` and `Harness.claude` getters and their interface
  properties; callers use the target-aware factory.
- Keep the existing shared file installation/removal and manifest handling.
  Connectors own scope-dependent homes, instruction paths, and translated
  content. Their homes must isolate manifests across scopes and harnesses.
- Outside connectors, limit changes to option parsing/help, local project
  validation, target propagation, named-getter removal, and relevant tests.
- Remove `uninstall --self` completely, including parsing, argument state,
  execution branch, usage/help, and associated tests. Coderail tool
  uninstallation will be handled separately and is outside this idea.
- Without `--local`, preserve global installation and uninstallation behavior.

## Implementation status

Implemented in [ticket 0012](../../tickets/closed/0012-support-project-local-harness-instruction-installation.md).
Both commands accept `--local`, discover the initialized project root, and pass
the selected scope to connectors. Codex and Claude connectors are now functional;
`uninstall --self` is no longer accepted. The investigation notes below describe
the baseline used for the design.

## Initial investigation (historical)

- The working changes advertise `--local` in both commands' help, but neither
  parser accepts it yet. Install and uninstall currently target `harness.home`.
- The connector contract exposes a single installation home; concrete Codex and
  Claude connectors are currently unimplemented placeholders.
- The named harness getters are referenced only by the factory itself and tests;
  no command depends on them. Update those tests when removing the getters.
- Existing operations track files in `.coderail-install` and protect modified
  files using `--force` and confirmation options.
- At investigation time, `uninstall --self` was still parsed but unimplemented;
  any remaining support must be removed under the confirmed decision above.

## Readiness

No consequential decisions remain open. Connector-specific layout details and
internal implementation choices remain with implementation, preserving native
harness layouts and manifest isolation. No decomposition is needed.

## Verification expectations

- Cover parsing, help, valueless option validation, explicit/default harness
  selection, and existing force/confirmation behavior with local operations.
- Verify project discovery from subdirectories, global `--cwd`, and failure
  before mutation outside an initialized project.
- Exercise local install/uninstall round trips, manifest tracking, modified and
  unrelated files, and independence of local and global installations.
- Verify target propagation to connector constructors and independence of local
  installations for different harnesses. Update tests using removed getters.
- Verify `--self` is rejected as an unknown option and is absent from usage/help.
- Run `cr verify` for each modified source or test file during implementation,
  as required by AGENTS.md.

## References

- `src/commands/install.ts`
- `src/commands/uninstall.ts`
- `src/harness/connector.ts`
- `src/harness/codex.ts`
- `src/harness/claude.ts`
- `src/runtime/context.ts`
- `tests/commands/install.test.ts`
- `tests/commands/uninstall.test.ts`
