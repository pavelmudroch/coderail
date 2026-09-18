## Problem Statement

Users need the same Coderail workflow in each supported agent harness. Copying the bundle manually does not adapt harness formats, track ownership, protect customizations, or support reliable updates and removal.

## Goal

Implement user-level installation, update, and removal for Codex, Claude Code, Copilot CLI, and Gemini CLI. Install all bundled instructions, skills, and the worker agent; protect unmanaged and edited files; expose reusable lifecycle operations and diagnostic state.

## Solution Overview

`cr install <harness> ...` renders the bundle for each selected harness and installs or updates its managed files. `cr uninstall <harness> ...` removes them. Both commands prepare one complete operation, validate every selected destination, resolve confirmations, and only then apply changes.

A shared lifecycle module owns file protection, ownership records, operation planning, execution, and reporting. Harness adapters own filenames and content conversion. The Coderail self-removal command and future `doctor` reuse these interfaces.

This specification covers the ready [harness lifecycle idea](IDEA.md), including the user's specification-time decision to install the bundled worker agent. It does not implement the separate Coderail program lifecycle.

## Requirements

1. Support the explicit names `codex`, `claude`, `copilot`, and `gemini`. Require at least one name for standalone install/uninstall; missing names, unsupported names, unknown options, and invalid option combinations show usage and fail. Do not infer `default_harness` or provide `--all`.
2. Support `--force`, `--yes`, and `-h`/`--help`, alongside existing global options. Deduplicate repeated harness names, retaining first-requested order. Return existing exit codes: `0` for success, `1` for operational failure, `2` for usage errors.
3. Preserve destination configuration and validation: defaults, global configuration, local configuration, then nonempty environment overrides, as implemented by `load_config`. Defaults are `$HOME/.codex`, `$HOME/.claude`, `$HOME/.copilot`, and `$HOME/.gemini`. Explicit configured/environment directories must already exist; missing default directories may be created during application.
4. Install all shipped instructions, skills, skill resources, and agent definitions for each selection. Do not install repository ideas, specifications, tickets, or project helper files. No project initialization is required.
5. Never overwrite or delete an unmanaged destination, including byte-identical files, with any flag combination. Report the path as unmanaged and advise moving or renaming it before retrying. Do not merge into existing user configuration files or infer ownership from filenames/content alone.
6. Compare managed files against the checksum of their last installed rendered bytes. Any edited file involved in update/removal fails validation without `--force`; `--yes` alone does not bypass this protection.
7. With `--force`, confirm each edited-file overwrite or deletion separately. Accept `yes`, `y`, `no`, and `n`, case-insensitively; an empty answer defaults to No. No deliberately preserves that file and counts as success if all remaining actions succeed. Report preserved files.
8. `--force --yes` approves those per-file destructive actions without prompting. Required prompts fail when interactive input is unavailable; EOF or read failure is not a preservation choice.
9. Updates remove previously managed files absent from the new rendered bundle. Unchanged obsolete files are removed automatically; edited obsolete files use the same protection and confirmation rules as uninstall.
10. Validate all selected harnesses and resolve every required prompt before changing installed files or persistent ownership state. Validation/prompt failure leaves both unchanged. Temporary staging outside destinations is permitted and cleaned up.
11. After validation, stop on the first application failure. Do not roll back completed changes. Report completed actions, the failed action, deliberate preservation choices, and actions not attempted. Keep enough durable state to diagnose interrupted or partially completed operations.
12. Apply identical ownership/protection rules to instruction Markdown, skill resources, worker definitions, generated YAML/TOML, and obsolete managed files. Remove only managed files and empty directories created by Coderail; preserve unrelated directory contents.
13. Expose installed-harness enumeration and separate preparation/application interfaces for self-removal. Its combined validation must finish before either harness or Coderail program files are deleted. Harness application failure prevents program removal; deliberate preservation does not.
14. Keep scripts POSIX shell compliant and new scripts executable. Reuse existing command dispatch, logging, filesystem, Markdown, and test conventions where they fit.

## Implementation Decisions

### Module boundaries

* Command adapters in `lib/commands/install.sh` and `lib/commands/uninstall.sh` parse arguments, select destinations, invoke the lifecycle, and return CLI status. They do not duplicate protection logic.
* A shared harness module under `lib/utils` renders a desired file inventory, inspects recorded installations, prepares a complete install/removal plan, resolves confirmations, applies a prepared plan, and reports outcomes. Helpers use a harness-specific prefix to avoid collisions with sourced shell functions/globals.
* Rendering receives a harness ID, resolved home, bundle root, and staging directory. It returns staged bytes plus relative destination paths. Rendering never writes to the destination or edits source instructions.
* Preparation receives operation, selected installation roots, desired inventory where applicable, and force/yes policy. Its result contains ordered actions and observed preconditions. Confirmation resolution is separate from filesystem application so self-removal can validate its entire combined plan.
* Inspection is read-only and never prompts. Return structured records for managed, missing, modified, obsolete, preserved, incomplete, and invalid-state conditions. `doctor` owns presentation and repair authorization.
* Application returns per-action outcomes and an overall status instead of exiting from shared functions. CLI adapters alone choose process exit codes. Keep internal serialized plans private; the reusable function contracts are the integration boundary.

### Harness rendering

`H` below means the selected harness's resolved home. Preserve source skill and agent names. Treat the bundle under `instructions/` as authoritative; do not hardcode the current skill count.

| Harness | Global instructions | Skills and invocation | Worker agent |
| --- | --- | --- | --- |
| Codex | `H/AGENTS.md` | `H/skills/<name>/SKILL.md`; `$<name>`; invocation policy in `agents/openai.yaml` within each skill | `H/agents/worker.toml` |
| Claude Code | `H/CLAUDE.md` | `H/skills/<name>/SKILL.md`; `/<name>` | `H/agents/worker.md` |
| Copilot CLI | `H/copilot-instructions.md` | `H/skills/<name>/SKILL.md`; `/<name>` | `H/agents/worker.agent.md` |
| Gemini CLI | `H/GEMINI.md` | Implicitly invocable skills: `H/skills/<name>/SKILL.md`. Explicit-only skills: `H/commands/<name>.toml`, invoked as `/<name>` | `H/agents/worker.md` |

Codex's home-based skill location follows OpenAI's [published skill installation example](https://developers.openai.com/blog/eval-skills) and [CODEX_HOME contract](https://learn.chatgpt.com/docs/config-file/environment-variables). Its [current skill guide](https://learn.chatgpt.com/docs/build-skills) recommends the shared `$HOME/.agents/skills` discovery location and documents `$name` invocation and `agents/openai.yaml`. Retain the idea's configured-home boundary: do not also install shared copies or symlinks. Include home-based discovery in adapter acceptance; a future release that drops it requires a reviewed compatibility change, not a silent destination change. Codex [global instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md) and [standalone agent TOML](https://learn.chatgpt.com/docs/agent-configuration/subagents) provide the remaining formats.

Claude supports [personal instructions](https://code.claude.com/docs/en/memory), [skills with invocation controls](https://code.claude.com/docs/en/skills), and [personal Markdown agents](https://code.claude.com/docs/en/sub-agents). Copilot documents [user instructions](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions), [personal skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills), and [skill metadata and personal agent formats](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference).

Gemini documents [global instructions](https://geminicli.com/docs/cli/gemini-md/), [native skills](https://geminicli.com/docs/cli/skills/), [TOML commands](https://geminicli.com/docs/cli/custom-commands/), and [Markdown agents](https://geminicli.com/docs/core/subagents/). Its documented skill metadata does not provide the bundle's explicit-only invocation policy; explicit-only skills therefore become custom commands rather than automatically discoverable skills.

Rendering rules:

* Render only recognized `<skill>name</skill>` references. Codex uses `$name`; Claude/Copilot use `/name`. Gemini uses `/name` for command-backed skills and an explicit instruction to activate the named skill for native skills. Reject unknown or malformed skill references before application. Preserve unrelated text and shell variables.
* Preserve skill `name`, `description`, body, and resource-relative relationships. Validate the simple bundled frontmatter using existing Markdown utilities; do not introduce a general YAML parser or execute instruction text.
* Claude/Copilot retain `disable-model-invocation`. For Codex, translate it to `policy.allow_implicit_invocation: false` in `skills/<name>/agents/openai.yaml`; omit the unsupported frontmatter key. An absent/false source flag leaves implicit invocation enabled.
* Gemini explicit-only command TOML contains `description` and `prompt`. The prompt contains the rendered body and a trailing argument slot using `{{args}}`. Preserve auxiliary resources under a managed resource directory outside native skill discovery, such as `H/coderail/skills/<name>/`; rewrite resource links to that location. Do not also publish an implicitly discoverable duplicate skill. Native skills retain `name`, `description`, and their rendered body/resources.
* Convert agent frontmatter/body into each native format. Codex TOML has `name`, `description`, and `developer_instructions`; the latter holds the rendered body. Claude/Gemini/Copilot use Markdown with their supported name/description fields and the rendered body. Omit model and permission overrides, inheriting harness defaults.
* Escape generated TOML/YAML strings correctly, including quotes, backslashes, multiline text, and delimiter sequences. No shared `config.toml`, `settings.json`, or other user settings file needs to be claimed for these adapters.
* Keep installed files independent of the Coderail program directory. Self-removal with preserved harnesses must not leave links/imports pointing at deleted program files.
* Invalid source metadata, duplicate rendered paths, unsupported source structures, or unreadable bundled resources fail preparation. Detect overlap between selected roots and ownership by another recorded installation; never allow two installations to claim the same destination.

### Ownership and operation state

Keep harness state outside the Coderail program installation, under `${XDG_STATE_HOME:-$HOME/.local/state}/coderail/harnesses`. Require an absolute state root. This registry records all installed roots, including roots selected by earlier environment overrides, so self-removal can enumerate them without guessing from today's configuration.

Standalone install/uninstall selects the currently resolved home for each named harness. Changing configuration does not relocate or silently remove an earlier installation. Self-removal with harness removal selects all recorded roots; users can address an earlier root directly by restoring its destination override.

Use versioned, non-executable, line-oriented records readable with POSIX utilities. Store paths as fields, not shell assignments. Support spaces and shell metacharacters; reject tab/newline-bearing paths before mutation if using tab-delimited records. Validate schema versions, field counts, duplicate entries, and path containment when reading state.

Each installation record contains:

* Harness ID and canonical absolute home; identify an installation by this pair, with a collision-free registry identifier.
* Bundle version, rendered inventory identity, and last operation status. Inventory identity must change when source content or rendering rules change even without a version bump.
* For each managed file: safe relative destination, source identity/file kind, and last installed checksum and byte length from POSIX `cksum` over rendered bytes. This is accidental-edit detection, not a security signature.
* Coderail-created directories, plus deliberate preservation records identifying operation/action and whether the retained file is still managed.

Ownership transitions:

| Outcome | Ownership afterward |
| --- | --- |
| New file or replacement successfully installed | Managed, with checksum of bytes actually installed |
| Current bundled file deliberately kept during update | Still managed, retaining the previous installed checksum; record preservation without accepting edited bytes as the baseline |
| Managed file successfully deleted or already absent during removal | No active ownership |
| Edited obsolete file or uninstall target deliberately kept | Released from ownership and recorded as preserved; subsequent install treats it as unmanaged |
| Action failed or not attempted | Prior ownership remains, qualified by the operation journal |

A completed uninstall is successful even when files were deliberately preserved. Preserve its small outcome record for diagnosis, but do not count it as an active installation. An already absent managed file is recreated by install and treated as already removed by uninstall. Uninstall of a root with no active record is a reported no-op; it never deletes matching-looking files.

Existing v1 files without trustworthy ownership metadata are unmanaged. Do not silently adopt them, including symlinks. Report move/rename guidance; automatic v1 migration is outside this scope.

Persist an operation journal after successful validation and before the first destination change. It records all selected roots, planned actions, observed old checksums, intended new checksums, preservation decisions, and action progress. Mark an action in progress before mutation and complete only after its ownership update is durable. Publish individual files/state records with same-directory temporary files and rename where applicable; never truncate a live target while preparing its replacement.

An interruption between file application and state publication remains visible as an incomplete action. Inspection compares old/intended bytes without silently adopting or repairing them. An ordinary install/uninstall refuses unresolved incomplete or malformed state with actionable diagnostic guidance; repair authority belongs to `doctor`. A successful rerun after a fully completed operation is idempotent.

Serialize lifecycle writers with a POSIX-compatible exclusive lock associated with the registry. Lock/staging artifacts are temporary and not installation outcomes. Concurrent invocation fails before changes; a stale lock is reported with inspection guidance, never automatically stolen. Persisted journals survive temporary cleanup.

### Validation, application, and reporting

Prepare all selected harnesses in request order, with deterministic relative-path ordering within each. Include obsolete-file actions in the same plan. Validate ownership, all source rendering, file types, root overlap, state integrity, and available parent-directory permissions before asking destructive questions. Reject unexpected directories, devices, or symlinks at file destinations; resolve a configured root once and reject descendant symlinks that redirect managed operations.

After every prompt succeeds, recheck observed file/state preconditions before the first mutation. Check each target again immediately before applying its action; a later external change is an application failure, not permission to overwrite newly edited/unmanaged content. No validation can guarantee that later filesystem writes will succeed.

For a managed file, checksum mismatch remains protected even if it happens to equal the newly rendered source. Unchanged current files with identical desired bytes need no rewrite. Keep/delete/replace decisions are per file, so deliberately preserving a file can leave mixed customized and bundled content.

Outcome reporting names paths and distinguishes `created`, `updated`, `removed`, `already absent`, `unchanged`, `preserved`, `failed`, and `not attempted`. Deliberate preservation is success; unresolved validation, prompts, journal/state publication, writes, and deletions are failures. Report a file mutation that succeeded before a state-write failure accurately; do not label it wholly unattempted or wholly committed.

### Reusable confirmation utility

Add `log_confirm <question>` to `lib/utils/log.sh`:

* Return `0` for Yes, `1` for an explicit/default No, and `2` for unavailable input/read failure. Callers must distinguish No from error; do not use a single negated condition that treats both as preservation.
* Emit the question with `[y/N]` on stderr. Read from stdin only when stdin is a terminal and existing `log_interactive` permits interaction. Respect `NON_INTERACTIVE`, `--non-interactive`, and current quiet-mode behavior; do not fall back to `/dev/tty` to bypass them.
* Trim surrounding whitespace and match accepted answers case-insensitively. Reprompt on other input; an actual empty line means No. EOF/read failure logs an error in the utility itself and returns `2`.
* Do not embed force/yes policy in the utility. The caller bypasses per-file questions only for `--force --yes`; the same utility remains usable for self-removal selection and other commands.

### Self-removal integration

The [Coderail lifecycle scope](../coderail-installation-upgrade-and-removal/IDEA.md) owns public parsing and program removal for `cr uninstall --self`. This scope supplies the reusable harness inventory and lifecycle functions.

* `--with-harnesses` selects every active or incomplete recorded harness installation, including earlier custom roots. `--without-harnesses` preserves them. These flags are mutually exclusive and invalid for standalone harness removal; `--self` cannot be combined with positional harness names.
* If active harness installations exist and neither flag is supplied, ask whether to remove all using `log_confirm`. No preserves them and permits program removal. Unavailable input fails with guidance to provide one of the selection flags. `--yes` never answers this selection question.
* Build and validate the combined harness/program removal plan and resolve all confirmations before applying either part. Apply harness actions first. Any failure prevents program removal; deliberately kept edited files count as successful harness outcomes.
* Preserve registry records needed for harnesses left installed, preserved outcomes, or incomplete operations when program files are removed. Harness discovery must work after Coderail is reinstalled elsewhere.
* Test this contract through a composed caller/fake program-removal stage until the sibling command exists; do not implement a partial program uninstaller here.

## Testing Decisions

Use focused executable `tests/commands/install.test.sh`, `tests/commands/uninstall.test.sh`, and corresponding `tests/utils` tests for shared lifecycle/rendering and `log_confirm`. Follow `tests/suite.sh` and existing isolated command-test patterns. Run sourced command integration in a fresh `sh -eu` process so test conditionals do not hide errexit failures. Give each case temporary HOME, state root, bundle, and harness directories; never touch the developer's installed harnesses.

Cover observable behavior:

1. All four adapters: complete inventory, global filenames, valid native agent/skill/config formats, invocation policy, reference conversion, resources, and escaping. Sources remain byte-identical. No repository artifacts or shared settings changes appear.
2. CLI usage and exit codes, duplicate names, global flags, config precedence, explicit missing-home rejection, default-home creation, paths with spaces, and operation outside initialized projects.
3. Fresh install, unchanged rerun, update, missing-file restoration, obsolete-file cleanup, uninstall, already-absent files, and uninstalled-root no-op.
4. Unmanaged ordinary files, byte-identical files, symlinks, shared-root conflicts, malformed state, and unsafe manifest paths remain untouched for every force/yes combination.
5. Edited current and obsolete files: no force, yes alone, force with Yes/No/default, force+yes, and mixtures of preserved and changed files. Verify ownership transitions as well as content and exit status.
6. Later-harness validation failure and later prompt EOF leave every earlier harness and persistent state unchanged. Use a pseudo-terminal for real accepted/default/invalid-answer tests; redirected stdin, noninteractive mode, and EOF must exercise utility errors directly.
7. Inject failures in file creation/replacement/deletion and journal/state writes after earlier successes. Assert stop-on-first-failure, accurate reports, preserved completed bytes, unattempted later actions, and inspectable incomplete state. Include interruption between a file mutation and ownership publication.
8. Concurrent writer exclusion and precondition changes during prompting/application. Confirm no unmanaged or newly edited file is overwritten on a stale plan.
9. Self-removal composition: all selection modes, no installations, prior custom roots, unavailable selection input, yes not selecting removal, combined preflight failures, deliberately kept files permitting program removal, and harness failure preventing it.

Run the new test scripts directly with `sh` and syntax-check changed shell scripts with `sh -n`. Also run `./bin/cr test <changed-lib-paths...>` for the repository mapping. The current `.coderail/test_map` maps `lib/${path}/${file}.sh` to its matching test, but its trailing `|| :` masks test failures; direct focused test execution is therefore required. Do not fix that unrelated mapping in this scope. Add narrowly scoped mappings for adapter/bundle changes if needed to run renderer tests; new mappings must propagate failures.

During adapter acceptance, record harness versions and verify actual discovery in disposable user homes/profiles: global instructions load, explicit skills/commands are callable, native skills are discoverable, and `worker` is available. Verify custom-home startup separately; Coderail destination overrides do not necessarily share a harness's own environment-variable names. These smoke checks complement offline fixture tests and must not require accounts/model calls for the normal test suite. Run the full suite only if shared changes are expected to affect other functionality.

## Out of Scope

* Installing/upgrading/removing Coderail program files, bootstrap downloads, PATH changes, and implementing `cr uninstall --self` itself.
* `doctor` command behavior, repair permissions, automatic recovery, rollback, or silently adopting existing files.
* Project-local harness setup, `init`, templates, ideas, tickets, specifications, loops, and Git helpers.
* Skill subset selection, `--all`, installing harness binaries, plugins/marketplaces, or changing harness model/security preferences.
* General YAML/TOML editing, shared-settings merges, and arbitrary external skill package support.

## Assumptions

* Supported harnesses mean their CLI/user-profile integrations. IDE, cloud-agent, and plugin installations are separate concerns.
* The worker agent is included, as explicitly confirmed by the user while specifying this idea. Its instructions remain unchanged apart from necessary harness rendering.
* Coderail manages rendered copies, not links into its program installation. Names remain the bundle's names; conflicts are resolved by the user rather than automatic namespacing.
* Destination configuration controls where Coderail writes. Users must start a harness with its matching profile/home settings; the installer reports the resolved destination and does not alter shell startup files.
* Absent managed files are recoverable through install and harmless during uninstall. Deliberate deletion-preservation releases ownership; keeping a still-shipped file during update retains its old baseline.
* A user-level registry independent of the program directory is necessary to discover earlier custom destinations and retain diagnostic state after self-removal.

## Further Notes

Repository research found no existing install/uninstall command, harness renderer, ownership manifest, or checksum lifecycle to migrate. `bin/cr` already dispatches command modules and recognizes all four harness IDs. `load_config` and `log.sh` supply the configuration and interaction conventions to preserve.

Official harness documentation was checked on 2026-09-18. Adapter fixtures and recorded acceptance versions must make compatibility changes visible; do not infer unsupported fields from another harness's similar format. In particular, Codex home-based skill discovery needs the acceptance check described above, and Gemini explicit-only workflows use documented custom commands.

The parent idea remains split; this specification covers one harness lifecycle leaf. Existing changes to the idea, its parent, and unrelated source files are preserved.

## Ticket Plan

No tickets created. Implementation can be ticketed as shared state/planning and prompt utility, harness rendering, and command/integration coverage, with command work depending on the shared lifecycle and adapters. All belong to this single specification; program self-removal remains in its sibling scope.
