---
title: "Stream verbose verification output"
status: "archived"
---

# Stream verbose verification output

The implementation for ticket 0053 enables live output by default in `cr verify`. See the
[command reference](../../../docs/COMMANDS.md#verify-your-changes) for output modes.

## Intended outcome

When `cr --verbose verify` runs a command, show its output as the command emits it so the user can follow progress and diagnose failures during the run.

## Behavior before implementation

The runner uses `Deno.Command.output()` to collect stdout and stderr until the child exits. File checks run sequentially and report after each file completes. Identical expanded commands reuse a cached result, including its captured output. Preparation and cleanup use the same executor. Verify sends status lines to stdout and subprocess output to stderr.

## Options

- Forward both child pipes to Coderail's stderr as bytes arrive. This keeps stdout available for status lines and forwards partial lines promptly. Independent pipes cannot guarantee exact ordering across stdout and stderr, and some commands buffer output when writing to a pipe.
- Forward complete lines through Coderail's logger. This makes it possible to label lines, but delays partial lines and changes carriage-return progress output.
- Inherit the child's stdout and stderr. This gives the child direct access to the terminal when one is present, and child stdout shares the destination used for Coderail's status lines.

## Agreed behavior

Forward complete lines through `Log.info` for verbose runs, including preparation and cleanup. Show the command before it starts so the following lines have context. Send child output to stderr once per execution and keep existing status lines on stdout. Reused results still contribute statuses to each affected file. Keep the current normal, quiet, and dry-run behavior. In `--verbose --short`, give `--short` precedence and suppress subprocess output.

Read stdout and stderr concurrently, decode each independently, and emit each line when its newline arrives. Accept LF and CRLF and emit a final unterminated line at end of stream. Keep each stream's line order and allow interleaving between streams. Terminal-style progress that only writes carriage returns can appear late, and a child's own buffering can also delay output. The repository's configured lint, test, and coverage commands are a good fit for line-oriented logs.

## Module boundaries

`src/commands/verify.ts` owns the output mode, command heading, and logger calls. `src/commands/verify/run-checks.ts` owns execution, line framing, and result reuse. The runner can provide optional callbacks for command start and each line to both file checks and hooks through their shared execution path. The exact callback signatures and line framing implementation are delegated to implementation.

## Verification expectations

Use a child process that emits a complete line to each stream and waits for a signal before exiting. Verify the parent forwards both lines before releasing the child and that stdout receives the final status lines. Cover final unterminated lines, hooks, shared command results without duplicate output in verbose mode, and output behavior for normal, quiet, short, verbose with short, and dry runs.
