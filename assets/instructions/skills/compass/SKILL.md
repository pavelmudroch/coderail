---
name: compass
description: Guide users through any stage of the Coderail workflow, recommend next steps, explain intended usage, and troubleshoot commands, configuration, skills, and recovery.
disable-model-invocation: true
---

## Guide from the current state

- Help the user stay involved in agent-assisted development and understand the design, implementation, interfaces, and resulting changes.
- Answer the immediate question first; explain the relevant workflow and recommend a concrete next action with its command or skill invocation.
- Adapt to the user's current stage and desired involvement; avoid restarting completed steps or requiring the entire workflow for a small, well-defined change.
- Distinguish guidance from execution. Inspect relevant state to answer questions; perform mutations only within the user's requested scope.
- Reconstruct progress from persisted artifacts and Git state rather than assuming conversation history is complete.
- Inspect only what the question requires: CLI version and help, project configuration, idea tree, relevant tickets and artifacts, Git status and diffs, or loop logs.
- Read `cr --help`, `cr <command> --help`, or `cr <command> <subcommand> --help` for installed syntax. Use `cr idea --json` and `cr ticket next --json` for structured discovery.
- Prefer installed behavior over remembered syntax. Consult matching project documentation and implementation when available; distinguish implemented behavior from plans and examples.
- Read the relevant sibling skill's `SKILL.md` before carrying out its workflow. Locate installed skills through the harness when sibling files are unavailable.
- Explain skill invocation through the agent interface: use `$explore` in Codex or `/explore` in Claude, substituting the relevant skill name. Keep agent skills distinct from `cr` subcommands.
- Ask for missing consequential decisions only after checking available project context; state uncertainty when evidence cannot resolve it.

## Choose the next step

| Current need or state | Recommend |
| --- | --- |
| Missing project setup | Initialize, configure verification, and install harness instructions. |
| Unclear goal, scope, behavior, or important interfaces | Use `explore` to produce an implementation-ready idea. |
| Agreed design without actionable work | Use `ticket` to create small tickets with dependencies and validation criteria. |
| Ready ticket for autonomous implementation | Use `implement` with the ticket, or let it select the next ready ticket. |
| User wants to write the code and learn | Use `mentor` to guide implementation and review each task. |
| Queue of ready tickets for unattended work | Use `cr loop`, after checking its prerequisites and Git scope. |
| Failing verification or incomplete task | Diagnose and correct the failure before marking the task complete or closing the ticket. |
| Staged changes needing explanation and discussion | Use `walkthrough` to review them and record agreed follow-up work. |
| Agreed review findings | Address in-scope corrections; create tickets for independent work; return to `explore` for consequential design changes. |
| Verified behavior missing from documentation | Use `docs` to synchronize the relevant documentation. |
| Reviewed changes ready to record | Stage the intended changes and use `commit`. |
| No ready tickets | Distinguish an empty queue from unfinished active work or unsatisfied dependencies. |

Use `code` for implementation and code-review conventions, `question` for focused clarification, and `research` for focused delegated investigation when those skills are available and relevant.

## Set up and maintain the environment

- Check `cr --version` and `cr --help` when diagnosing installation or version differences.
- For a new packaged installation on supported Linux or macOS systems, point to `https://raw.githubusercontent.com/pavelmudroch/coderail/main/install.sh`; explain the default `~/.coderail` root and `CODERAIL_INSTALL_ROOT` override. Follow the installer's dependency and PATH guidance; packaged execution requires neither Deno nor Bun.
- Run `cr init` from the intended project root. Preserve existing configuration; use it again to repair `.coderail/.gitignore`. Keep configuration, plans, and tickets eligible for version control; keep runtime output ignored.
- Resolve commands against the nearest ancestor `.coderail` directory. Repair incomplete nested initialization instead of silently targeting a parent project. Use `cr --cwd <project> ...` to choose another working directory.
- Configure project checks in `.coderail/config` before implementation. Install the tools invoked by those checks separately.
- Install bundled skills and subagents with `cr install codex`, `cr install claude`, or both harness names. Add `--local` for the initialized project; otherwise use global installation.
- Set `default_harness = codex` or `claude` in configuration when omitting the harness argument; check `DEFAULT_HARNESS` for an environment override.
- Explain global harness homes as `~/.codex` or absolute `CODEX_HOME`, and `~/.claude` or absolute `CLAUDE_CONFIG_DIR`. Explain local targets as `.codex/skills/` and `.codex/agents/`, or `.claude/skills/` and `.claude/agents/`.
- Account for bundled general instructions at Codex `AGENTS.md` or Claude `rules/coderail.md` within the chosen scope. Treat Codex `AGENTS.md` as a whole-file replacement, without merging existing instructions.
- Use the scope-specific `.coderail-install` manifest to understand ownership. Preserve unowned and modified files; inspect reported conflicts before recommending overwrite options.
- Explain `--force` as permitting per-file conflict confirmation; combine it with `--yes` to approve or `--no` to decline unattended conflicts only when that choice matches user intent.
- Use `cr uninstall [--local] <harness>` to remove owned instruction files in the selected scope. Preserve unrelated files and apply the same protections to modified files.
- Use `cr upgrade` for the latest stable release or reconciliation, `cr upgrade --list` for read-only stable-version discovery, `cr upgrade --version <version>` for a major, minor, or exact selection, and `cr upgrade --canary` for unreleased builds. Explain that exact versions permit downgrades.
- Distinguish distribution upgrades from installation of instructions into a harness; reinstall the relevant harness scope when its installed instructions need refreshing.
- Follow printed PATH setup instructions and open a new shell or reload the profile. Treat PATH consent separately from overwrite approval; use the executable's full path while resolving shell setup.
- Repair an interrupted installation by resolving its reported problem and rerunning the installer for the same root. Explain that another install root creates a separate installation and that completed writes have no automatic rollback.

## Explore and persist design

- Use `explore` to clarify outcomes, boundaries, constraints, behavioral contracts, consequential structure and public interfaces, and verification expectations.
- Start with one idea; split only when independent concerns justify it. Keep shared decisions at the appropriate ancestor and load relevant ancestors when resuming a child.
- Create ideas with `cr idea create "Title"`; inspect the tree with `cr idea` or `cr idea --json`.
- Persist design in `.coderail/plans/<idea>/IDEA.md` and referenced artifacts. Preserve CLI-generated frontmatter and use returned identifiers and paths.
- Use `cr idea split <idea> "First part" "Second part"` to create at least two children and mark the parent `split`. Use `cr idea create --parent <split-parent> "Title"` to add a child to a split parent.
- Mark an open idea `ready` with `cr idea ready <idea>` only after resolving consequential decisions and leaving only delegable implementation choices. Keep shared design and relevant children ready before handing off split work.
- Use `cr idea reopen <idea>` to resume design work on a non-split idea; keep split parents as containers for shared decisions.
- Treat idea readiness as design readiness, without implying implementation or ticket completion.
- Preserve current understanding, agreed decisions, and open questions rather than conversation transcripts. Let the user control session restarts; recover context from artifacts afterward.

## Create and progress tickets

- Use `ticket` to turn agreed implementation context into vertical slices of value, with focused numbered checkbox tasks, task details, verifiable outcomes, and references.
- Place test tasks before implementation tasks where applicable as a planning convention; related implementation may be needed before tests pass. Minimize dependencies and file overlap; retain meaningful acceptance criteria for each task.
- Create tickets with `cr ticket create "Title"`; add dependencies with repeated `-d <ticket>` or `--depends-on <ticket>`. Ticket arguments, dependencies, and duplicate targets accept numeric ID, filename, or ticket path.
- Preserve generated frontmatter. Track tickets under `.coderail/tickets/open/`, `active/`, and `closed/`; use CLI transitions instead of manually moving files or changing lifecycle fields.
- Maintain `TICKETS.md` beside the corresponding `IDEA.md` when applicable; link tickets to their design and relevant artifacts.
- Select work with `cr ticket next -l 1`; explain that selection lists dependency-ready open tickets in ascending ID order without activating them.
- Inspect active tickets separately when reconstructing unfinished work; do not assume `next` lists every unfinished ticket.
- Activate an open ticket with `cr ticket activate <ticket>` and use its returned path after the move. For autonomous implementation, use numbered order as the default; interleave or reorder work when dependencies and practical implementation needs justify it. Preserve declared ticket dependencies and explicit task prerequisites.
- Use `implement` for autonomous coding, correction, verification, and closure. Use `mentor` when the user owns implementation; let it inspect and explain without writing implementation code and wait for user readiness before reviewing or advancing tasks.
- Treat numbered tasks as scope and validation checkpoints; reordering never permits skipping requirements. Mark tasks complete only after their validation criteria pass and leave incomplete or unvalidated tasks unchecked. Close work with `cr ticket close --reason=done <ticket>` only after all tasks and required verification pass.
- Close redundant work with `cr ticket close --reason=duplicate --duplicate-of=<canonical-id> <ticket>`; use `--reason=dismissed` for intentionally abandoned scope.
- Explain dependency satisfaction precisely: require closure as `done`, or a duplicate chain reaching a ticket closed as `done`. Treat dismissed, open, active, and cyclic duplicate chains as unsatisfied.
- Reopen any ticket with `cr ticket reopen <ticket>`; add dependencies with repeated `-d <ticket-id>` when needed. Account for movement to `open/`, preserved tasks, merged dependencies, and cleared closure metadata.
- For blocked queues, inspect dependency IDs, closure reasons, duplicate targets, missing tickets, and cycles. Resolve the actual prerequisite rather than closing incomplete work to unblock selection.

## Configure and diagnose verification

- Load defaults from `config` under the installation root and project settings from `.coderail/config`. Account for environment overrides and global CLI options when diagnosing effective settings. Treat verification rules and pre/post command arrays as accumulated global and project settings rather than replacements.
- Use `[[verify.rules]]` entries with a `pattern` and `commands` arrays of executable arguments. Match project-relative paths and substitute named captures into arguments and optional `requires` paths.
- Adapt this rule to the project's tools:

  ```toml
  [[verify.rules]]
  pattern = "src/${path:**/}${file:*}.ts"
  commands = [["deno", "check", "src/${path}${file}.ts"]]
  ```

- Explain `*`, `**`, and `?` glob matching and `${name:glob}` captures; reference captures as `${name}`. Preserve optional directory separators as in the example; reject undefined capture references.
- Run `cr verify <file...>` for changed implementation files, `cr verify <directory>` for a subtree, or `cr verify -c` / `cr verify --changed` for Git-changed files. Add `-s` or `--short` for per-file summaries.
- During ticket implementation, prefer one `cr verify -s <changed-files...>` invocation with explicit relevant paths, including both a changed source file and its changed test file. Inspect failed files with `cr verify <failed-file>` for detailed output.
- Follow repository-specific verification requirements: include every required modified file and honor explicit requirements for separate invocations over the batching preference. Exclude ticket files and unrelated unchanged files from implementation verification.
- Explain that checks run from the project root. A combined invocation reuses duplicate command results and runs preparation once, avoiding repeated work for overlapping source/test checks. Account for commands that modify files, such as formatters.
- Treat any failed check as failure even if the final file passes. Avoid shell loops that return only the last verification's status; prefer the CLI's multi-path invocation. When separate invocations are required, stop on failure or accumulate failure status so any failure makes the overall operation fail.
- Interpret `ok` as passing applicable checks, `fail` as failure, and `skipped` as no applicable commands, including missing required paths. Do not equate skipped files or `No tests found` with validated behavior.
- Add optional `[verify]` `pre` and `post` command arrays before rule entries; use them for once-per-run preparation and cleanup around matching work.
- Inspect failures with `cr verify <failed-file>` to expose command output. Check rule matches, `requires` files, capture substitutions, executable availability, working directory, and configuration diagnostics before attributing failures to code.
- Correct in-scope failures and repeat relevant verification until it passes; complete the final `cr verify -s <changed-files...>` aggregate check before ticket closure, in addition to any required separate invocations. In mentoring, let the user make corrections and wait for readiness before review or advancement. Distinguish implementation defects from unrelated failures and report unresolved blockers without claiming completion.
- Avoid redundant broad reruns without edits, failures, or unresolved concerns.
- Avoid rerunning verification solely because existing changes are staged, reviewed, or committed; run it after relevant modifications or when needed to investigate a concrete concern.

## Run and recover autonomous loops

- Use `cr loop [codex|claude]` to repeat ready-ticket implementation in fresh native CLI sessions. Require an initialized Git project, installed harness instructions, configured verification, and an authenticated native CLI on PATH with permissions suitable for non-interactive execution.
- Check that the initialized subtree has no staged, unstaged, or untracked work at startup. Preserve outside work; explain that auto-commit also rejects staged changes anywhere outside the subtree.
- Start with `cr loop codex --limit 1` when the user wants one implementation attempt. Omit the limit to continue until no ready tickets remain.
- Explain default stages as implement then stage; add `-r`/`--auto-review` for review before staging and `-c`/`--auto-commit` for commit afterward. Combine them as `-rc`; treat the flags independently and without boolean values.
- Explain built-in loop review separately from interactive `walkthrough`; require no separate review skill. Explain that auto-commit invokes `commit` and never pushes.
- Configure native model and effort strings in `[loop.codex]` or `[loop.claude]` using `model`, `effort`, and stage-specific `implement_model`, `implement_effort`, `review_model`, `review_effort`, `commit_model`, and `commit_effort`.
- Override settings with `-o model=<native-model>,effort=<native-effort>` or stage-specific hyphenated keys such as `review-model` and `commit-effort`.
- Resolve each model and effort independently: stage-specific CLI, common CLI, stage-specific saved setting, common saved setting, then native default. Merge project settings over global settings by harness and key.
- Explain preflight as a no-work probe requiring exactly `OK` for each distinct enabled model/effort combination. Avoid promising detection of silent native fallback or equal effort budgets across providers.
- Keep implementation and review from altering the existing index; let the loop stage the initialized subtree after successful sessions.
- Explain review as inspecting current unstaged and new untracked work with ticket context, preserving prior staged work, recording findings, reopening the original ticket for required in-scope fixes, and creating tickets for necessary independent work. Leave fixes to subsequent implementation attempts.
- Expect selection to run again after staging and optional commit; explain that reopened tickets or ready follow-ups can run immediately and their dependents must wait.
- Count limits as implementation attempts, including retries on reopened tickets. Finish enabled review, staging, and commit stages before honoring the attempt limit; do not promise the ticket is finished at that limit.
- Treat empty and dependency-blocked queues as successful stops; inspect the queue to distinguish completion from unresolved prerequisites.
- Inspect `.coderail/loop/<UTC-timestamp>-<random-id>/preflight.jsonl` and `<ticket-id>.jsonl` when terminal summaries lack detail. Filter records by `step`, `stream`, and `output`; expect repeated attempts to append to the same ticket log.
- On failure or cancellation, inspect files, ticket state, Git index, commits, and logs before resuming. Preserve partial results; explain that the loop stops without automatic rollback, retry, amend, or recovery.
- Resolve partial active tickets and verification failures through the appropriate skill; establish the required clean startup state before restarting a loop. Avoid discarding work to satisfy preflight.

## Review, document, and commit

- Stage only the changes intended for interactive review, then use `walkthrough` to explain all staged changes in manageable sections and discuss findings.
- Associate the staged diff with an idea before recording decisions. Preserve existing `REVIEW.md`; record agreed actionable changes and consequential unresolved questions beside that idea.
- Keep walkthrough implementation edits, staging, and commits outside its scope. Let the user confirm review completion; distinguish suggestions from agreed work.
- Implement agreed corrections through the appropriate workflow, verify modified files, and review again as needed. Reopen affected tickets or create follow-ups according to scope.
- Use `docs` to update relevant user documentation and changelogs against verified current behavior. Supply an explicit baseline when inspecting committed changes requires a comparison range.
- Stage final reviewed changes and use `commit` to create logically coherent Conventional Commits. Preserve the initial staged scope and all initially unstaged or untracked work; avoid amending existing commits.
- Distinguish ticket closure, verification, staging, review, documentation, commit, and push as separate milestones. Leave pushing under user control.

## Troubleshoot unsupported or unclear behavior

- Reproduce the smallest relevant failure; inspect the exact command, version, working directory, configuration, and diagnostic before recommending a remedy. Use `--verbose` for detail and `--no-color` for plain output when useful.
- Check installed scope and destination when skills are missing or stale; check harness home overrides for global installs and nearest-project selection for local installs.
- Resolve command ambiguity with IDs or returned paths; consult subcommand help rather than inferring commands from skill names or example tickets.
- Treat `doctor` and `template` as placeholders and `cr init <template>` installation as simulated unless the installed implementation demonstrates otherwise. Diagnose manually instead of promising automatic repair or template creation.
- Consult Coderail's `README.md` for user workflows, `DEVELOPMENT.md` for source tooling, `RELEASING.md` for shipping and packaging, and `CHANGELOG.md` for version history when those files are available. Avoid applying Coderail's own development toolchain to unrelated user projects.
- Finish guidance with the most useful next action and any unresolved blocker; avoid presenting the entire workflow when one step answers the question.
