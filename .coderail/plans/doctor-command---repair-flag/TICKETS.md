# Doctor repair tickets

The [agreed idea](IDEA.md) is the behavioral and API specification. These five
vertical deliveries add supported repairs and ticket health diagnostics without
changing shared Command or harness connector APIs. Each ticket places meaningful
behavioral tests before implementation and requires per-file `cr verify` for all
modified/new src and tests files under [AGENTS.md](../../../AGENTS.md).

| Ticket | Delivered outcome | Dependencies |
| --- | --- | --- |
| [0042 — Repair doctor project initialization with collected actions](../../tickets/open/0042-repair-doctor-project-initialization-with-collected-actions.md) | Usable --repair for config/ignore rules, shared initialization helpers, guarded actions, deduplication, one recheck and final-status reporting. | None; extends existing doctor implementation |
| [0043 — Validate customized instructions and repair conservative frontmatter](../../tickets/open/0043-validate-customized-instructions-and-repair-conservative-frontmatter.md) | Content-based instruction validation and conservative name/opener repairs across assets and owned global/local Markdown, preserving content and ownership baselines. | 0042 |
| [0044 — Diagnose ticket metadata and authoritative file placement](../../tickets/open/0044-diagnose-ticket-metadata-and-authoritative-file-placement.md) | Tolerant frontmatter inventory, metadata/closure/identity checks and expected-location findings integrated into project diagnostics. | 0042 |
| [0045 — Diagnose ticket dependency integrity and blocked progression](../../tickets/open/0045-diagnose-ticket-dependency-integrity-and-blocked-progression.md) | Reference/cycle integrity and causal stuck-ticket findings, distinguishing normal waiting and done-ticket satisfaction. | 0044 |
| [0046 — Repair ticket placement from authoritative frontmatter](../../tickets/open/0046-repair-ticket-placement-from-authoritative-frontmatter.md) | Guarded byte-preserving rename/move actions with collision/input revalidation and command-level repair acceptance. | 0042, 0045 (transitively 0044) |

0042 establishes the shared execution contract and finishes project initialization
changes before 0044 integrates ticket checks. After 0042, instruction work (0043)
and ticket diagnostics (0044) can proceed independently: they own installation and
project/ticket modules respectively. The 0044 → 0045 → 0046 sequence orders changes
to the shared ticket inventory and test module. The explicit 0042 dependency on
0046 documents its use of repair interfaces as well as inventory/graph behavior.

All findings are collected before actions run; independent failures do not stop
other repairs, cancellation propagates, and one complete recheck determines final
exit status. Tests cover plain-doctor no writes, non-interactive execution,
concurrent changes, partial failure and convergence. Unsupported metadata/graph
repairs, instruction regeneration, ownership baseline changes, distribution
recovery, PATH edits and harness executable installation remain outside scope.

This decomposition changes planning artifacts only; implementation is tracked by
the unchecked tasks in these tickets.
