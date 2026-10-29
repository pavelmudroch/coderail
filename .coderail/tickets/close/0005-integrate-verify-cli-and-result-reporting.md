---
title: Integrate verify CLI and result reporting
status: closed
depends-on: 0002, 0004
reason: done
duplicate-of: 
---

# Integrate verify CLI and result reporting

Complete `cr verify` by connecting validated rules, file selection, sequential checks, and the documented output modes. Depends on ticket 0002 (including 0001) and ticket 0004 (including 0003).

## Tasks

1. [x] Cover verify arguments, reporting, and runtime integration
2. [x] Implement verify parsing, orchestration, and output

## Task details

### 1. Cover verify arguments, reporting, and runtime integration

Scope: add `tests/commands/verify.test.ts`; extend existing runtime/main tests only where necessary.

Expected outcome:

- Cover `-h`/`--help`, `-s`/`--short`, `--changed`, positional paths, `--`, empty `rest`, unknown options, boolean values, and required selection except for help.
- Cover help outside initialization, initialized-project requirements, direct invocation without repository root, and global `--cwd` behavior.
- Cover validation of every rule and explicit path before any child check starts.
- Cover stdout file/JSON-command statuses, stderr full command output, short/quiet modes, replayed output, and skipped rules without details.
- Cover `No tests found` for no changed files, empty directories, unmatched rules, missing dependencies, and empty commands, including short/quiet output and preceding skipped file lines.
- Cover failed-file exit code 1 without a summary exception, propagated configuration/filesystem/Git errors, and cancellation preserving exit code 3. Restore global logging and exit state after tests.

Validation: exercise orchestration and externally visible behavior using fixtures/child processes as appropriate; leave configuration-loader acceptance tests unchanged.

### 2. Implement verify parsing, orchestration, and output

Scope: extend the existing user edits in `src/commands/verify.ts`, replacing stubs and updating help. Use the command-local modules delivered by dependencies.

Expected outcome:

- Implement `Command<VerifyArguments>` with `help`, `short`, `changed`, and `paths`; set `requiresInit = true`. Follow existing conventions for early help and use `Cli.raiseUsageError` for argument errors.
- Use `context.context.repositoryRoot` and `currentWorkingDirectory`; guard a missing root without falling back to cwd.
- Compile/validate all rules, select/validate all files, then run checks with a per-file reporting callback.
- Emit `${path} ${status}` through `Log.output`. Normal mode adds indented `${JSON.stringify(command)} ${status}` for executed/reused checks and full nonempty saved output through `Log.info`.
- Short mode emits only file lines; quiet retains file/command statuses while existing logging suppresses command output. Repeat cached status/output for every affected file.
- Emit `No tests found` through `Log.output` when no distinct command executed; this alone succeeds. Set `Deno.exitCode = 1` for failed files without throwing a summary error; propagate invocation errors/cancellation.
- Explain `skipped`, normal/short modes, and output behavior in help. Do not change configuration loading, runtime discovery, global parsing, or generic filesystem APIs.

Validation: run `cr test ./src/commands/verify.ts` and `cr test ./tests/commands/verify.test.ts`; run the repository-prescribed `cr test` command for any additionally changed runtime/main source or test file.

## References

- [Design: CLI integration](../../plans/verify-command/DESIGN.md#cli-integration)
- [Design: reporting](../../plans/verify-command/DESIGN.md#reporting)
- [Design: validation expectations](../../plans/verify-command/DESIGN.md#validation-expectations)
- [Verify decisions](../../plans/verify-command/IDEA.md)
- [Existing verify command](../../../src/commands/verify.ts)
- [Command context](../../../src/commands/helpers/command.ts)
- Dependencies: tickets 0002 and 0004
