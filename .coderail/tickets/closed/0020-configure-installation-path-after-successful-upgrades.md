---
id: "0020"
slug: "configure-installation-path-after-successful-upgrades"
title: "Configure installation PATH after successful upgrades"
status: "closed"
created_at: "2026-11-05T10:46:53.893Z"
updated_at: "2026-11-05T11:17:48.507Z"
dependencies: []
reason: "done"
---

# Configure installation PATH after successful upgrades

Let upgrade offer PATH setup after successful activation, including bootstrap and same-version reconciliation. Configure only the selected installation's bin directory, with consent, and preserve successful installation when PATH setup fails. Own platform-specific behavior in a private upgrade helper to limit overlap with selection and listing work.

## Tasks

1. [x] Specify PATH consent, platform behavior and nonfatal failures
2. [x] Implement idempotent shell and Windows user PATH setup
3. [x] Integrate post-activation prompting and terminal handling

## Task details

### 1. Specify PATH consent, platform behavior and nonfatal failures

Scope: add focused tests under `tests/commands/upgrade/` for a private PATH helper and extend `tests/commands/upgrade.test.ts` for lifecycle integration. Use disposable home/config directories and injected Windows environment transport; never change the developer's PATH configuration.

Expected outcome: cover PATH already containing selected bin, absent bin, consent/decline, unattended execution, explicit noninteractive mode, Bash/Zsh/Fish, Windows user PATH and unsupported shells. Verify paths with spaces, repeated runs without duplicate edits, preservation of existing config/PATH entries, write failures and manual guidance. Add terminal/subprocess coverage for piped stdin with a controlling terminal versus no terminal.

Validation: assert prompting and edits happen only after successful activation; declined/unattended runs do not edit, and PATH failures leave upgrade successful. Only root/bin is configured, never libexec. Run per-file `cr verify` for modified tests.

### 2. Implement idempotent shell and Windows user PATH setup

Scope: introduce a private helper under `src/commands/upgrade/` for PATH detection, shell-appropriate startup-file edits and Windows per-user PATH updates. Shell startup-file selection is an implementation choice following shell conventions.

Expected outcome: safely quote custom roots, preserve unrelated startup-file content and environment entries, avoid duplicate additions, and support Bash, Zsh, Fish and Windows user PATH without changing machine PATH. Produce concrete shell-specific manual commands and any required reload/new-shell instructions; unsupported shells receive manual guidance. A persistent edit cannot update the invoking parent shell.

Validation: task 1 helper cases pass using isolated fixtures, including permissions/transport failures. Run `cr verify` for every new or modified source/test file.

### 3. Integrate post-activation prompting and terminal handling

Scope: integrate the helper in `src/commands/upgrade.ts` after successful activation and update relevant usage guidance in `README.md`. Prefer private prompt handling; change shared logging only if required and cover any changed behavior.

Expected outcome: skip setup when selected bin is already on PATH; otherwise request explicit consent when interactive, or print manual instructions. Piped installation may prompt through an available terminal, while explicit noninteractive mode always suppresses prompts and edits. Existing overwrite flags do not supply PATH consent. Report PATH errors and manual guidance without turning successful distribution activation into failure.

Validation: task 1 command/terminal cases pass, including same-version repair and failed upgrades. Verify normal command reporting and conflict confirmations remain correct. Run per-file `cr verify` for all modified source/tests.

## References

- [PATH ownership and supported targets](../../plans/stable-release-installer/IDEA.md#agreed-installation-root-and-path-ownership)
- [Upgrade bootstrap amendments](../../plans/upgrade-command/IDEA.md#agreed-bootstrap-contract)
- [Upgrade command](../../../src/commands/upgrade.ts)
- [Current confirmation behavior](../../../src/log/confirm.ts)
- [Upgrade tests](../../../tests/commands/upgrade.test.ts)
- Installer consumer: [0022](0022-bootstrap-and-repair-stable-installations-with-installsh.md)
