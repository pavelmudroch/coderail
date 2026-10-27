---
title: Installation and uninstallation commands
status: split
---

## Desired Outcome

Install, update, and remove global harness instructions with consistent conflict
protection, explicit confirmation, and harness-native asset mapping.

## Understanding

- Scope is installation and removal of harness instructions only.
- Existing `cr install` and `cr uninstall` commands parse arguments, but their
  execution methods are placeholders.
- Both commands expose harness selection and `--force`; updated usage includes
  `--yes` and `--no` confirmation modes.
- `cr uninstall` also exposes `--self` for removing coderail itself.
- The ready `install-manifest-helper` idea defines file tracking and inspection;
  it leaves command workflows and approval decisions to callers.

## Decisions

- `cr uninstall --self` throws a not-implemented error for now. Whether to retain
  the option is deferred.
- Installing coderail itself through `install.sh` and the upgrade command is
  outside this idea's scope.
- Instructions are installed globally for the current user, into each harness's
  directory. Project-local installation is outside scope.
- Use harness-specific native locations. Do not install into the shared global
  `~/.agents` directory.
- Codex skills go into `~/.codex/skills`; Claude skills go into
  `~/.claude/skills`.
- Connectors supply destination paths, installation root, manifest location, and
  bundled content transformed into harness-native files. They do not own manifest
  lifecycle or file operations.
- Shared install/uninstall operations own manifest loading and validation,
  conflict inspection, confirmations, file writes/removals, and manifest updates,
  reusing the `InstallManifest` module.
- Connectors map all bundled instruction assets: root instructions,
  skills, and agents, adapting names and formats to the harness. Unsupported
  asset types require an explicit fallback decision rather than silent omission.
- Commands validate arguments, select harnesses, invoke shared operations using
  connector-provided mappings, and report results and aggregate exit status.
- When no harness is specified, commands use the configured default harness.
  If no default is configured, they raise a usage error.
- Modified tracked files block installation/removal without `--force`. Existing
  untracked installation destinations also block installation without `--force`.
- `--force` permits proceeding through confirmation prompts; it does not itself
  approve overwriting or removal. `--yes` automatically confirms prompts.
- Both command parsers require `--force` for `--yes`/`-y` and `--no`/`-n`, and
  reject using the two confirmation modes together as a usage error. Usage is
  `[--force [--yes | --no]]`.
- `--no` automatically declines every prompt, including transferring ownership
  of retained files pending removal. Safe actions needing no prompt still run.
- Without `--yes` or `--no`, prompt interactively. If confirmation is needed but
  no interactive terminal is available, fail that harness before any changes.
  Operations needing no confirmation can proceed without an interactive terminal.
- Declined actions, including `--no`, are successful outcomes. Report skipped
  files; actual errors still produce a failure exit status.
- Shared operations check for blocking file conflicts before changing any of a
  harness's files. Without `--force`, a conflict fails that operation without
  partial installation or removal.
- With `--force`, declining a file's confirmation prompt skips that file and
  continues. Declining an overwrite during reinstallation preserves the existing
  manifest entry and baseline; a skipped untracked destination remains untracked.
  Declining removal transfers ownership as described below.
- Selected harnesses run independently. Attempt all selected harnesses, report
  each result, and exit with failure if any fails. Conflict preflight applies
  per harness, not across all selected harnesses.
- Uninstall removes only files listed in the selected harness's install manifest.
  Untracked files remain untouched, including with `--force`. A missing manifest
  means nothing tracked to uninstall and no files are removed.
- Installation and removal manage whole files only. Do not merge instruction
  sections into existing files. Existing destination files follow the agreed
  conflict checks and confirmation rules.
- Reinstallation removes tracked files absent from the current bundled
  instructions. Unchanged obsolete files are removed automatically. Modified
  obsolete files block the harness operation without `--force`; with `--force`,
  prompt for removal. If removal is declined, retain the file but remove its
  manifest entry: it becomes user-owned and coderail stops tracking it.
- During explicit uninstall, declining removal also retains the file but removes
  its manifest entry, transferring ownership to the user.
- On an unexpected filesystem error after changes begin, stop that harness
  operation and retain completed changes. Record completed changes in the
  manifest where possible, report failure, and continue other selected harnesses.
  Do not attempt rollback.

## Risks and Caveats

- Preflight prevents partial changes from known conflicts, but unexpected
  filesystem errors can leave a partially completed harness operation. Manifest
  updates can also fail; report this rather than implying rollback succeeded.

## Decomposition

Four child ideas:

- [Common harness connector](common-harness-connector/IDEA.md): define the shared
  connector interface for paths, installation root, manifest location, and
  prepared content. Resolve this contract before install/uninstall operations
  proceeds to specification and tickets.
- [Install and uninstall operations](install-and-uninstall-operations/IDEA.md): commands, argument validation, harness
  selection, shared manifest and file workflow, confirmations, result reporting,
  and aggregate exit status. Consume the common connector contract. Exclude
  harness-specific file mapping and transformation.
- [Codex instruction connector](codex-instruction-connector/IDEA.md): supply Codex destinations and transformed content
  for all bundled assets, installation root, and manifest location.
  Verify discovery of the required `~/.codex/skills` destination.
- [Claude instruction connector](claude-instruction-connector/IDEA.md): supply Claude destinations and transformed
  content for all bundled assets, installation root, and manifest location.

The parent retains shared file-protection, confirmation, ownership-transfer, and
failure policies. Connector details remain for their individual forge sessions.

## Compatibility Context

- Codex supports custom agent TOML files; Claude supports agent Markdown files.
  Connectors must adapt bundled agent definitions to those formats.
- Official references: https://learn.chatgpt.com/docs/build-skills,
  https://learn.chatgpt.com/docs/agent-configuration/subagents,
  https://code.claude.com/docs/en/sub-agents.
