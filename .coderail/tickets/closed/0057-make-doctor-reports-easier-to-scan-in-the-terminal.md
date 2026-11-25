---
id: "0057"
slug: "make-doctor-reports-easier-to-scan-in-the-terminal"
title: "Make doctor reports easier to scan in the terminal"
status: "closed"
created_at: "2026-11-25T08:37:50.733Z"
updated_at: "2026-11-25T09:14:57.510Z"
dependencies:
  - "0056"
reason: "done"
---

# Make doctor reports easier to scan in the terminal

Give `cr doctor` a consistent multiline report that keeps the context needed to
understand each finding and act on it. Use stale plan ticket links as the first
example and apply the same layout across all diagnostic phases.

## Tasks

1. [x] Specify the terminal report contract in regression tests
2. [x] Render finding blocks, repair outcomes, and compact skips
3. [x] Supply structured details from project and ticket checks
4. [x] Supply structured details from installation, instruction, and configuration checks

## Task details

### 1. Specify the terminal report contract in regression tests

Extend the doctor command tests with mixed findings with and without details,
multiple stale links in one plan, and repair runs covering successful actions,
action errors, and actions whose findings persist after the recheck. Update
existing diagnostic assertions that depend on the old message layout.

**Expected outcome.** Tests describe the terminal layout and cover
project-relative paths when doctor runs from a nested project directory.

**Validation.** Assert block spacing and field order, document-relative current
and expected link destinations, the single automatic fix hint, compact skips with
their reasons, and the healthy message with skips or attempted repair errors.
Check that ANSI styling applies to the specified labels and marker only and that
`--no-color` preserves the same text and layout. Confirm final output on stdout,
verbose progress on stderr, and exit status 0 or 1 from the final findings.

### 2. Render finding blocks, repair outcomes, and compact skips

Add optional ordered `details?: { label: string; value: string }[]` to
`DoctorFailure`. Use `message` as the heading and render each finding in
`src/commands/doctor.ts` with relevant details and local `Manual fix:` guidance.
Use `Log.color` for red `Failure:` and `Unresolved:`, green `[repairable]` and
`Repaired:`, and yellow `Manual fix:`. Render the automatic fix hint once when
the final report contains an applicable repair action. Combine the distribution
manifest, launcher, and PATH skips into one source development mode line.

**Expected outcome.** Repair outcomes appear before recheck findings. An action
error appears on its own indented `Repair error:` line. A completed action whose
finding persists is shown as unresolved, and the finding appears in the final
report. A report with zero remaining failures retains `Doctor checks passed.`

**Validation.** Run the formatting, skip, repair, stream, and status scenarios
from task 1. Check that repair deduplication and the single diagnostic recheck
still work.

### 3. Supply structured details from project and ticket checks

Give discovery, project initialization, harness executable, ticket metadata,
placement, dependency, and plan-link findings short headings and ordered context
taken from the diagnostic inputs. Show in-project paths relative to the
discovered project root where that base is clear. For stale links, show the plan
path and the full current and expected destinations relative to the plan document.
Reuse existing plan-link path conventions. Keep enough context to act manually on
missing, unusable, or ambiguous targets.

**Expected outcome.** The report exposes the paths, ticket identities, and
diagnostic context needed for manual fixes. Ticket placement and link repairs
retain their existing eligibility and behavior.

**Validation.** Exercise doctor from a nested project directory and check stale
links in a plan alongside project and manual ticket findings. Run the existing
project and ticket diagnostic and repair cases with updated output assertions.

### 4. Supply structured details from installation, instruction, and configuration checks

Give installation and instruction findings short headings and ordered context,
including applicable paths, expected values, and errors. Expose configuration
source and underlying error from configuration diagnosis so doctor can format
them as separate details. Keep the configuration fallback, manual guidance, and
install or instruction repair actions intact.

**Expected outcome.** Findings from source and compiled installation checks,
global and local instructions, and configuration use the same report layout and
retain the values needed for manual repair.

**Validation.** Run existing source and compiled installation and instruction
cases, including partial repairs and simultaneous configuration failures. Check
that configuration source and error context remain visible and that explicit
global flags still take precedence.

## References

- [Approved report contract and mixed example](../../plans/doctor-command-output-format/IDEA.md)
- [Ticket 0056 on diagnosing and repairing stale plan links](../closed/0056-diagnose-and-repair-stale-plan-ticket-links-with-doctor.md)
- [Doctor command](../../../src/commands/doctor.ts), [finding types](../../../src/commands/doctor/types.ts), and [logging](../../../src/log.ts)
- [Project checks](../../../src/commands/doctor/project.ts), [ticket checks](../../../src/commands/doctor/tickets.ts), and [plan-link paths](../../../src/tickets/plan-links.ts)
- [Installation checks](../../../src/commands/doctor/installation.ts), [instruction checks](../../../src/commands/doctor/instructions.ts), and [configuration diagnosis](../../../src/conf/load-configuration.ts)
- [Doctor command tests](../../../tests/commands/doctor.test.ts) and [doctor check tests](../../../tests/commands/doctor/)
