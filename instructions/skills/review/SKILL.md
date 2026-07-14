---
name: review
description: Review repository changes for correctness, regressions, security, compatibility, and test coverage. Produce verified findings without modifying the repository.
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# Code Review

Review the requested changes and report only concrete, actionable findings. Store it in `.coderail/REVIEW.md` unless specified otherwise.

The review is read-only. Do not modify files, create commits, or implement fixes.
Assume all tests already pass, no need to run again.

## Goals

Determine whether the change:

* implements the requested behavior;
* preserves unrelated existing behavior;
* handles important edge cases and failures;
* follows repository instructions;
* preserves required API, CLI, configuration, and data compatibility;
* introduces security, concurrency, lifecycle, or performance defects;
* contains bugs not detected by existing tests and automated checks.

Prioritize correctness over style. Ignore formatting and lint issues unless they reveal a real defect.

## Review process

### 1. Establish scope

Identify what is being reviewed:

* working tree;
* staged changes;
* commit;
* branch;
* pull request.

Inspect the complete diff against the correct base. Exclude unrelated pre-existing changes unless they interact with the reviewed work.

Useful commands:

```sh
git status --short
git diff --stat
git diff
git diff --cached
git log --oneline --decorate -n 10
```

### 2. Read instructions and intent

Read relevant repository guidance, including:

* `README.md`;
* architecture documentation;
* directory-specific instructions.

Understand:

* the requested behavior;
* acceptance criteria;
* behavior that must remain unchanged;
* compatibility and failure-mode requirements.

Judge the implementation against the task, not against its own apparent intent.

### 3. Inspect affected behavior

Read the full diff and surrounding code.

Trace:

* changed functions to callers and consumers;
* modified types, schemas, configuration, and persisted formats;
* error, cleanup, rollback, and interruption paths;
* relevant tests and their assertions;
* platform and runtime assumptions.

Pay extra attention to boundaries involving external input, processes, filesystems, networks, persistence, concurrency, or public interfaces.

### 4. Evaluate risks

#### Correctness

Check for:

* wrong conditions or control flow;
* invalid assumptions;
* missing state transitions;
* incorrect return values;
* boundary and empty-value errors;
* incomplete cleanup or error propagation.

#### Regressions

Check for:

* broken callers;
* changed defaults;
* altered ordering or side effects;
* removed compatibility behavior;
* changes outside the requested scope.

#### Failure handling

Check:

* partial failures;
* cancellation and signals;
* retries and rollback;
* permission or filesystem failures;
* malformed external data;
* unavailable dependencies.

#### Security

Check for:

* injection;
* path traversal;
* unsafe temporary files;
* secret exposure;
* missing authorization checks;
* incorrect escaping;
* unsafe parsing or deserialization;
* security-relevant race conditions.

Report security issues only when a realistic execution path exists.

#### Concurrency and lifecycle

Check for:

* races and lost updates;
* background-process handling;
* shutdown behavior;
* resource leaks;
* time-of-check/time-of-use issues;
* incorrect ownership or cleanup.

#### Compatibility

Check:

* public APIs;
* CLI arguments and exit codes;
* configuration;
* stored data;
* generated files;
* supported platforms and runtimes.

#### Tests

Inspect whether relevant tests:

* verify externally observable behavior;
* cover important boundaries and failure paths;
* contain assertions strong enough to detect regressions;
* preserve existing contracts;
* test outcomes rather than implementation details.

Missing coverage is normally supporting evidence, not a standalone finding. Report the concrete defect that the missing coverage permits.

## Subagents

The primary reviewer owns the review and final findings.

Use subagents only for independent risk areas in large or complex changes, such as:

* behavioral correctness;
* tests and regressions;
* security;
* concurrency and process lifecycle;
* API, configuration, or data compatibility.

Do not use subagents for small or localized changes.

Give each subagent:

* the task description;
* exact review scope;
* relevant repository instructions;
* one narrow review responsibility;
* the required finding format.

Subagents return candidate findings only.

The primary reviewer must verify every candidate before reporting it. Discard findings that are speculative, duplicated, stylistic, pre-existing, or unrelated to the change.

Usually zero to three subagents are sufficient.

## Finding validation

Before reporting a finding:

1. Trace the complete execution path.
2. Confirm the triggering state is reachable.
3. Check whether another layer already handles it.
4. Confirm it is caused or exposed by the reviewed change.
5. Use a focused reproduction when practical.
6. Verify the referenced location.

Do not convert uncertainty into a finding.

## Finding requirements

A finding must be:

* introduced or exposed by the change;
* realistically observable;
* relevant to correctness, safety, compatibility, or maintainability;
* specific and actionable;
* supported by code, documentation, or reproduction.

Do not report:

* subjective style preferences;
* unrelated refactoring opportunities;
* hypothetical issues without a reachable path;
* duplicated tool diagnostics;
* generic praise;
* pre-existing defects unrelated to the change.

## Severity

* **Critical**: severe security compromise, data loss, corruption, or widespread failure.
* **High**: serious incorrect behavior in an important or common path.
* **Medium**: meaningful defect under realistic conditions.
* **Low**: limited but concrete defect worth correcting.

Severity reflects impact and likelihood, not fix difficulty.

## Output

List findings first, ordered by severity.

For each finding:

```text
[severity] Concise title

Location: path/to/file.ext:line
Confidence: high | medium | low

Describe the triggering conditions, actual behavior, expected behavior,
and practical impact.

Direction: Brief guidance on what must change. Do not provide an
implementation or patch.
```

Then include:

```text
Review scope:
- Reviewed changes and base revision

Validation performed:
- Focused commands or reproductions used to verify findings
- Behavior that could not be validated and why

Residual risks:
- Unverified areas
- Relevant assumptions or environmental limitations
```

If no findings are identified, state:

```text
No actionable findings found.
```

Still include scope, validation, and residual risks.