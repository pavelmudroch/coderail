---
title: "Doctor command output format"
status: "archived"
---

Make `cr doctor` output easier for people to scan in a terminal. Stale plan
ticket links are the first example. Use the example to explore a format that
also works with mixed findings and repair outcomes.

## Related ideas

- [Doctor command](../doctor-command/IDEA.md) established diagnostic collection,
  reporting of failures and skipped checks, and exit status.
- [Doctor command --repair flag](../doctor-command---repair-flag/IDEA.md) added
  repair attempts, a diagnostic recheck, and reporting of repair outcomes. Both
  ideas are archived, so this follow-up has its own open idea.

## Current behavior

- `src/commands/doctor.ts` renders repair outcomes and errors first, then
  remaining failures with automatic repair markers and manual repair guidance,
  then skipped checks. If no failures remain, it prints `Doctor checks passed.`
- Final results go to stdout and verbose progress goes to stderr. The final
  diagnostic pass determines the exit status. The command has no `--json` mode.
- A stale plan link currently prints the absolute plan path, the old link, the
  absolute expected ticket path, a repairable marker, and a separate manual
  instruction. Several stale links in the same plan repeat most of that text.
  Source mode also prints separate skip lines for the distribution manifest,
  launcher, and PATH checks.

## Agreed direction

Use one multiline block per finding, with a short heading and indented details.
This gives installation, configuration, project, harness, and ticket findings
the same layout while allowing each check to describe its own context.

## Output contract

- Separate findings with a blank line. Show only the fields relevant to the
  finding, in a stable order supplied by the check. Keep the full values needed
  for manual repair, with project-relative paths where their base is clear.
  For links, present both destinations as paths relative to the plan document.
- Identify automatically repairable findings and show `cr doctor --repair`
  once in a diagnostic report when it can address at least one finding.
  Keep manual guidance with the finding it applies to.
- When CLI color is enabled, render `Failure:` and `Unresolved:` in red,
  `[repairable]` and `Repaired:` in green, and `Manual fix:` in yellow.
  Apply color to those labels and marker only. Keep the same wording and
  layout with `--no-color`.
- Show attempted repair results before findings from the recheck. Put an action
  error on an indented line. If an action finishes but its finding persists, show
  the action as unresolved and the finding in the final report.
- Keep skipped checks compact and retain their reasons. A report with no
  remaining failures can still show skipped checks or attempted repair errors.
- Preserve stdout for the report, stderr for verbose progress, and exit status
  based on findings from the final diagnostic pass.

Illustrative mixed report:

```text
Failure: Stale ticket link · 0043 [repairable]
  Plan: .coderail/plans/doctor-command---repair-flag/TICKETS.md
  Current link: ../../tickets/open/0043-fix-example.md
  Expected link: ../../tickets/closed/0043-fix-example.md
  Manual fix: Update the link to the expected destination.

Failure: Incomplete project ignore rules [repairable]
  File: .coderail/.gitignore
  Manual fix: Run cr init from the project root.

Failure: Configured harness executable unavailable
  Executable: claude
  Manual fix: Install the configured harness or update the configuration.

Automatic fix: cr doctor --repair
Skipped in source development mode: distribution manifest, launcher, PATH
```

For a healthy run, retain `Doctor checks passed.` and show any skipped checks.
For a repair run, show an outcome such as `Repaired: Restore project ignore
rules` or `Unresolved: Restore project ignore rules` with an indented `Repair
error:` line when applicable, followed by any remaining findings.

## Structure and verification

- In `src/commands/doctor/types.ts`, use `DoctorFailure.message` as the short
  heading and add optional ordered `details?: { label: string; value: string }[]`.
  Keep manual guidance and repair actions separate. Each check supplies detail
  values directly from its diagnostic inputs.
- Keep collection, repair orchestration, and generic formatting in
  `src/commands/doctor.ts`. The formatter renders the same fields for every
  finding and uses `Log.color` for the colored labels and marker. Existing repair
  results supply the action description and error.
- Cover mixed findings with and without details, project-relative and plan-relative
  paths in a nested cwd, healthy runs with skips, and repair runs with successful,
  failed, and unresolved actions. Confirm stream routing and the existing exit
  status behavior. Check colors for findings and repair outcomes. Confirm that
  `--no-color` keeps the same text, indentation, and separation between findings.

## Readiness

- The multiline layout, path conventions, repair presentation, shared finding
  fields, and color rules are agreed. Individual finding wording and private
  formatting helpers remain implementation choices.
