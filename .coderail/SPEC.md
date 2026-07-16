## Problem Statement

The transcript setup added to `cr ticket loop` fails in two edge cases. A repository-level ignore rule for `.coderail/loop/` prevents Git from staging the newly generated nested `.gitignore`, so a legacy project cannot complete its first loop handoff. Also, `loop_setup` reports successful creation when it could not create the loop directory or write its ignore file.

## Goal

Make first-use transcript setup reliable while preserving the existing local-ignore ownership and transcript-safety rules.

## Solution Overview

Harden the shared loop setup helper so directory and ignore-file creation failures are returned to its callers. When the loop itself has just created its infrastructure file, stage only that file with Git's force option; this permits an ancestor ignore rule without changing it. Continue to verify that the planned transcript is ignored before invoking an agent.

## Requirements

1. `loop_setup` must return failure if creating `.coderail/loop` fails or if writing a newly required `.gitignore` fails. It must print `true` only after the file was written successfully.
2. A pre-existing `.coderail/loop/.gitignore` remains user-managed: do not overwrite it and report `false` as today.
3. If `loop_setup` created `.coderail/loop/.gitignore`, `cr ticket loop` must stage that exact file even when a higher-level Git ignore rule excludes `.coderail/loop/`.
4. Do not force-stage an existing user-managed ignore file, the transcript, or any other path.
5. Keep the existing failure if the planned transcript is not ignored, and keep the existing first-use staging order before agent invocation.

## Implementation Decisions

* Keep setup behavior in the existing shared loop utility. Check both `mkdir -p` and the ignore-file write, returning their failure instead of falling through to the success marker.
* Keep the helper's output contract: `true` means it created the ignore file; `false` means it found one already. Failed setup has a non-zero status and must not claim either success state.
* In the loop command's existing `true` branch, use the narrow Git force-add form for `.coderail/loop/.gitignore`. The conditional branch already guarantees this applies only to infrastructure created during the current handoff.
* Do not alter the root `.gitignore` or repair custom nested ignore content. A higher-level rule may continue to ignore the whole directory; Git force-add is solely for the tracked nested infrastructure file.

## Testing Decisions

Add focused regressions; do not run the full suite.

* Extend the loop utility tests with a project where `.coderail/loop` is an ordinary file. Assert setup returns non-zero and does not report `true`.
* Extend ticket-loop tests with a tracked root `.gitignore` containing `.coderail/loop/`. On first use, assert the generated nested `.gitignore` is staged, the transcript remains ignored, and the agent can be invoked. Reuse the failing-agent setup when asserting that only the infrastructure file is staged.
* Retain coverage that an existing nested ignore file is preserved and that an unignored planned transcript stops the loop before agent invocation.
* Validate with:

  ```sh
  sh test/utils/loop.test.sh
  sh test/commands/ticket/loop.test.sh
  ```

## Out of Scope

* Changing transcript locations, formatting, agent invocation, or normal post-agent staging.
* Changing root ignore rules or modifying user-managed nested ignore files.
* Broader error-handling changes outside loop setup.

## Assumptions

* Git's forced add of an explicit path is the intended way to track a newly created nested ignore file beneath an ignored directory.
* `cr init` continues to use the helper and benefits from its corrected failure status without needing separate behavior changes.

## Further Notes

The review reproduced both failures. The transcript check should remain after infrastructure setup: in the ancestor-ignore case it succeeds because the higher-level rule already ignores the transcript.
