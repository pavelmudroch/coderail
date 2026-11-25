---
name: archive
description: Preview and, after explicit approval, archive eligible closed Coderail tickets and archived plans to local Git history.
---

# Archive Coderail records

1. Run `cr archive --json preview` in the Coderail project. If it fails, report
   the CLI diagnostic and stop.
2. Summarize `eligible` and `deferred` from the preview. Keep the reported
   groups intact and include the CLI's `reasons` for each deferred group. If
   `eligible` is empty, report that there is nothing to archive and stop.
3. Propose a batch name and a nonempty description based on the eligible groups.
   Use lowercase letters or digits separated by single hyphens in the name, such
   as `doctor-and-link-maintenance`. Coderail adds the UTC date. Explain that
   apply records the eligible files in local Git history, then removes them from
   the working tree. Tell the user to pause source edits and ticket or plan
   updates until apply finishes. Ask for explicit approval in the harness for
   the proposed cleanup and batch details. Stop if approval is declined or
   absent. If the project changes before apply, refresh the preview and ask
   again for approval of the current selection.
4. After approval, run
   `cr archive --json apply --yes <batch-name> <description>` in the same
   project. Pass the approved description as a single argument. The CLI rechecks
   eligibility and handles recording, source removal, and any rollback.

If apply returns `status: applied`, report `batchId` and show the available
browsing commands.

- `cr archive list`
- `cr archive plans <batch-id>`
- `cr archive tickets <batch-id>`
- `cr archive read <batch-id>/<path-to-file>`

If apply reports an empty selection, report that there was nothing to archive.
If it reports a decline, report that cleanup was declined. On a nonzero exit,
report the CLI diagnostic, including the failure phase, rollback outcome, and
any batch ID, commit IDs, or paths provided for manual recovery. Stop after
reporting the error.

The archive is local to `coderail/archive-history`. Leave pushing or fetching
that branch to the user.
