---
title: Verify command
status: ready
---

## Desired Outcome

Complete `cr verify` as documented in `src/commands/verify.ts`, using existing
verification configuration to select and execute checks for files.

## Understanding

The command currently has help text and stub argument parsing and execution.
Its help describes explicit paths, recursive directory selection, `--changed`,
deduplicated files and commands, reused command results, and short output.
Existing verification configuration defines `pattern`, `commands`, and optional `requires`.

## Constraints

Preserve existing user changes. Forge behavior before specification or implementation.

## Decisions

`requires` lists file dependencies, not executable prerequisites. A missing required
file causes commands to be skipped rather than failed.

Required paths support named captures from the rule's pattern and resolve relative
to the project root. All required files must exist; otherwise skip that rule's
commands for the matched file.

Match project-relative paths against every configured rule. Run all matching rules
in configuration order. Substitute `${name}` captures into command arguments as
well as required paths. Execute command argument arrays directly, without a shell.

`--changed` selects staged, unstaged, and untracked files from Git, filtered to the
initialized Coderail project and excluding deleted files. Explicit paths add to
that set. Deduplicate selected files.

Files with no runnable checks (no matching rule, or all matching rules skipped for
missing dependencies) report `skipped` without failing the invocation. Update
output documentation to include `skipped` alongside `ok` and `fail`.

Process files sequentially. For each file, execute applicable commands sequentially
in configuration order. On the first failed command, mark the file `fail` and skip
its remaining commands, including later matching rules. Continue with other files.
Execute each distinct expanded command only once per invocation and reuse its
result for all files needing it. A reused failed result also stops that file.
Commands never reached due to an earlier failure remain eligible for other files.
Any failed file makes the invocation fail. A file with at least one executed or
reused check and no failures reports `ok`, even if other rules were skipped.

Require an initialized Coderail project; fail otherwise, following existing command
conventions. Honor global `--cwd` for project discovery and explicit CLI path
resolution. Match patterns and resolve required paths from the discovered project
root, and execute commands there. Do not fall back to the working directory.

Patterns use glob matching against complete project-relative paths, with `/` as
the separator. `*` matches within one segment; `**` spans zero or more directories.
`${name:glob}` captures matched text for `${name}` substitutions. Undefined capture
references are configuration errors.

Directory arguments include all files recursively, including Git-ignored files.
Do not add ignore filtering in this capability; revisit if needed.
Ignore every symbolic link; select only regular files and traverse only regular
directories. Required dependencies must likewise be regular files.

Both output modes print one file-path-and-status line to stdout (`ok`, `fail`, or
`skipped`). Without `--short`, follow each file line with the invoked commands and
their `ok`/`fail` statuses on stdout, and each command's full output on stderr
(including output originally written to the child process's stdout). Buffer results
as needed to report the file status before command details. With `--short`, omit
command details and child-process output.

Repeat reused command statuses and their full saved output for each file's report.
Use `Log.output` for file and command status lines, keeping them visible with
`--quiet`. Use `Log.info` for full command output, so `--quiet` filters it.

Reject missing or outside-project explicit paths before executing any checks.
Deleted files discovered through `--changed` remain ignored.

If no checks run, emit `No tests found` with `Log.output`, including in short and
quiet modes. This covers no changed files, empty directories, no matching rules,
and all rules being skipped for missing required files. Preserve per-file `skipped`
lines when files were selected. Finding no tests is not itself a failure.

## Risks and Caveats

Broad directory arguments may traverse dependencies or generated files. The
accepted premise is that source directories are organized to avoid this cost.

Normal output requires buffering full command output to place the file status
first and replay reused results. Large command output can increase resource use.

## Assumptions

Use the existing configuration schema and loading order. No new configuration
format, shell execution, concurrency, or ignore filtering is needed.

This is one cohesive capability suitable for one specification; implementation
and `SPEC.md` are outside this forge session.
