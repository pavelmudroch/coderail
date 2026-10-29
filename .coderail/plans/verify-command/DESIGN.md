# Verify command design

Status: proposed for approval.

## Scope and established decisions

Implement the behavior recorded in [IDEA.md](./IDEA.md), using the existing
configuration schema and loading order. This document defines the implementation
design; it does not implement the command or decompose it into tickets.

Additional decisions established during design:

- Support only `*`, `**`, `?`, and `${name:glob}` in patterns. `?` matches one
  character other than `/`.
- Treat empty command argument arrays as no commands. Leave stricter validation
  for later investigation. An empty command list has the same effect.

Preserve the existing edits to `src/commands/verify.ts`, extending its help and
replacing its stubs during implementation. No changes to configuration loading,
runtime discovery, global argument parsing, or generic filesystem APIs are needed.

## Source structure and responsibilities

Use command-local modules; no new top-level facade or import alias is needed.

| File | Responsibility |
| --- | --- |
| `src/commands/verify.ts` | CLI parsing, orchestration, reporting, invocation exit status |
| `src/commands/verify/select-files.ts` | Explicit paths, Git selection, traversal, containment, deduplication |
| `src/commands/verify/compile-rules.ts` | Pattern compilation, capture/reference validation, expansion |
| `src/commands/verify/run-checks.ts` | Dependency checks, sequential execution, result reuse, file outcomes |

Keep supporting functions private to these modules. Share contracts through the
module that owns them rather than introducing a separate types module.

## CLI integration

`Verify` implements `Command<VerifyArguments>` and sets `requiresInit = true`.

```ts
type VerifyArguments = {
    help: boolean;
    short: boolean;
    changed: boolean;
    paths: string[];
};
```

Parse `-h`/`--help`, `-s`/`--short`, `--changed`, positional paths, and `--`.
Return an empty `rest`. Follow existing command conventions for early help,
unknown options, and rejecting values on boolean options. Require at least one
path or `--changed`, except when help is requested. Use `Cli.raiseUsageError` for
argument errors. Help remains available outside an initialized project.

Use `context.context.repositoryRoot` as the project root and
`context.context.currentWorkingDirectory` to resolve CLI paths. Guard a missing
project root when called directly; never substitute the working directory.

Execution order:

1. Compile and validate all configured rules.
2. Select and validate all files before starting checks.
3. Run checks, reporting each completed file through a callback.
4. Print `No tests found` if no distinct command was executed.
5. Set `Deno.exitCode = 1` if any file failed. Do not throw an additional summary
   error for ordinary check failures.

Configuration, filesystem, and Git errors propagate to the existing main error
handler. Cancellation also propagates, preserving the existing exit code 3.

## File selection contract

```ts
export async function selectFiles(
    root: string,
    cwd: string,
    paths: string[],
    changed: boolean,
    signal: AbortSignal,
): Promise<string[]>;
```

Return unique project-relative file paths using `/`, sorted lexically for stable
execution and output. Internal filesystem operations use native absolute paths.
Explicit paths are filesystem paths, not globs.

Resolve and validate every explicit path before returning. Reject missing paths
and paths outside the project. Use a relative-path containment check that permits
the project root itself as a directory argument and distinguishes `..` segments
from names beginning with `..`. Avoid changing the shared `Path.isWithin` helper.

Walk regular directories recursively, including hidden and Git-ignored entries.
Use `lstat`; ignore symbolic links and other non-regular entries. Check path
components beneath the project root so explicitly naming a child of a symlink
does not bypass the traversal policy. An explicitly supplied symlink contributes
no files. This does not introduce filesystem locking against concurrent changes.

For `--changed`, discover the enclosing Git worktree root with Git, then request
`git status --porcelain=v1 -z --untracked-files=all` from that root. Parse NUL
records, including the extra source-path record for renames/copies; select the
destination path. Filter paths to the Coderail project, then apply the same
regular-file and symlink checks. Ignore deleted/missing Git entries. Combine
these files with explicit selections and deduplicate. Git is required only when
`--changed` is requested; a missing executable or non-worktree is an error.

Pass the abort signal to Git subprocesses and check it while traversing.

## Rule compilation contract

Reuse the existing rule type through `Configuration['verify']`.

```ts
export type ExpandedRule = {
    commands: string[][];
    requires: string[];
};

export type CompiledRule = {
    match(path: string): ExpandedRule | undefined;
};

export function compileRules(rules: Configuration['verify']): CompiledRule[];
```

Compile every rule once, preserving configuration order. Validate syntax and all
capture references before execution, even for rules that match no selected file.
Include the rule index and offending pattern/reference in configuration errors.

Pattern semantics:

- Match the entire project-relative path, case-sensitively, including dotfiles.
- `*` matches zero or more non-`/` characters; `?` matches one non-`/` character.
- `**` matches across directories. A complete `**/` segment can match zero
  directories; `src/**/file.ts` therefore matches `src/file.ts`.
- `${name:glob}` captures the text matched by its inner glob. Use unique names
  matching `[A-Za-z_][A-Za-z0-9_]*`; reject malformed or nested captures.
- A complete `${path:**}/` segment has the same zero-directory behavior. Its
  capture is `''` when absent and excludes the following separator when present.
  Thus the existing scaffold `src/${path:**}/${file:*}.ts` works at every depth.
- Resolve ambiguous captures greedily from left to right, with backtracking to
  satisfy the complete pattern. Match `?` as one Unicode code point.
- All other characters are literal, including brackets, braces outside capture
  syntax, parentheses, and backslashes. No escaping or extended glob syntax.

Implement this bounded grammar with a small scanner that emits an anchored regular
expression and capture metadata, escaping literal regex characters. Do not use a
broader glob library that silently accepts additional syntax.

Replace `${name}` references in each command argument and required path in one
pass, using captures from that rule. Do not recursively expand captured text,
split arguments, invoke a shell, or apply environment expansion. Undefined capture
references are configuration errors. Ignore empty command arrays before execution.

## Check execution contract

```ts
export type CommandResult = {
    command: string[];
    status: 'ok' | 'fail';
    output: string;
};

export type FileResult = {
    path: string;
    status: 'ok' | 'fail' | 'skipped';
    commands: CommandResult[];
};

export async function runChecks(
    root: string,
    files: string[],
    rules: CompiledRule[],
    signal: AbortSignal,
    report: (result: FileResult) => void,
): Promise<{ executedCommands: number; failedFiles: number }>;
```

For each file, visit every rule in configuration order. Expand a matching rule,
resolve its required paths relative to the project root, and require every path
to be a regular file without symlink traversal. Missing files, directories,
symlinks, or non-directory parent components skip that rule. Other I/O errors
propagate. `requires` paths are literal filesystem paths after substitution, not
globs or executables. Check dependencies when the rule is reached; earlier
commands may have created or removed them.

Execute nonempty argument arrays with `Deno.Command(command[0], { args, cwd:
root, signal, stdin: 'null', stdout: 'piped', stderr: 'piped' })`. Zero exit status
means `ok`; nonzero status or inability to start the executable means `fail`.
Save launch-error diagnostics as command output. Cancellation is an invocation
abort, not a cached command failure.

Cache each completed result by `JSON.stringify(command)`, preserving argument
boundaries. The working directory and inherited environment are fixed for the
invocation. Cache both success and failure; never cache commands that were not
reached. A cache hit is included in that file's command results just like an
execution. Stop that file at its first failure and continue to the next file.

A file with no executed or reused commands is `skipped`; otherwise it is `fail`
if any command failed and `ok` if none failed. Empty commands never create cache
entries, reports, or increment `executedCommands`.

Buffer both subprocess output streams and decode their complete contents. Store
stdout followed by stderr; ordering between the two original streams is not
preserved. Report one completed file at a time, retaining command results in the
invocation cache for replay. No concurrency or persistent cache is introduced.

## Reporting

Use `Log.output` for `${path} ${status}` on one line. In normal mode, follow it
with one indented `${JSON.stringify(command)} ${status}` line per executed or
reused command. The JSON argument array makes spaces and argument boundaries
unambiguous. Send each command's saved full output through `Log.info`, without
truncation; omit the call for empty output. Existing logging supplies its normal
line termination and terminal handling.

`--short` emits only file lines. `--quiet` preserves file and command status
lines but suppresses command output through the existing `Log.info` behavior.
Reused results repeat both their status and saved output. Rules skipped for
missing dependencies have no command detail lines.

Emit `No tests found` using `Log.output` whenever `executedCommands === 0`, after
any selected files' `skipped` lines. This is successful unless an invocation
error occurred. Update help to include `skipped` and explain both output modes.

## Validation expectations

Add tests alongside existing command tests, mirroring the new source modules:

- `tests/commands/verify.test.ts`: parsing, help without initialization, required
  selection, stdout/stderr routing, short/quiet modes, repeated output, no checks,
  and failure exit status. Restore global logging and exit state after tests.
- `tests/commands/verify/select-files.test.ts`: recursive/ignored/hidden files,
  duplicate inputs, ordering, project boundaries, invalid paths before execution,
  symlink entries and ancestors, subdirectory `--cwd`, and a Coderail project
  nested inside a larger Git worktree. Use a temporary Git repository to cover
  staged/unstaged/untracked changes, renames, deletions, and unusual filenames.
- `tests/commands/verify/compile-rules.test.ts`: full-path matching, every grammar
  token, zero-directory globstars and captures, greedy captures, literal regex
  punctuation, Unicode `?`, invalid captures/references, one-pass substitution,
  argument preservation, multiple rules, and empty commands.
- `tests/commands/verify/run-checks.test.ts`: dependency skipping and I/O errors,
  sequential execution in the project root, success/failure reuse, argument-array
  cache identity, early file failure with continuation, commands reached only by
  later files, launch errors, full output buffering, and cancellation.

Use small child processes and filesystem markers to verify actual execution and
reuse. Extend existing runtime/main tests only where needed to exercise verify's
integration. Do not change existing configuration-loader acceptance tests.

Run `cr test` for each changed source file and each added/changed test file as
required by the repository instructions. No source or test files are changed by
this design artifact.
