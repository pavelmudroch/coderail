# Doctor command tickets

The [approved idea](IDEA.md) is split into three incremental deliveries. Each ticket
places regression tests before implementation and requires per-file source/test
verification under AGENTS.md. The idea remains the behavioral specification.

| Ticket | Purpose | Dependencies |
| --- | --- | --- |
| [0035 — Diagnose installation health through doctor bootstrap](../../tickets/closed/0035-diagnose-installation-health-through-doctor-bootstrap.md) | Make doctor run before normal startup, collect installation findings in source/compiled layouts, and render manual guidance with exit status. | None |
| [0036 — Diagnose project initialization and configuration](../../tickets/closed/0036-diagnose-project-initialization-and-configuration.md) | Add nearest-project discovery, initialization checks, independent configuration diagnostics, and Conf-owned fallback preserving explicit global flags. | 0035 |
| [0037 — Diagnose harness instruction integrity and executable availability](../../tickets/closed/0037-diagnose-harness-instruction-integrity-and-executable-availability.md) | Inspect global/local harness instruction manifests and check only the configured harness executable. | 0036 (transitively 0035) |

0035 delivers a usable installation diagnostic command; 0036 adds project and
configuration health; 0037 completes harness checks. Sequential dependencies keep
shared doctor orchestration and diagnostic phase changes ordered. Tasks within each
ticket separate test coverage, component work, and integration/verification.

The shared Command interface stays unchanged. Bootstrap dispatch precedes eager
runtime/configuration loading; installation checks precede project discovery. All
actual findings initially have `repairable: false`, with manual recovery options;
blocked checks are skipped and cancellation propagates. Automatic repair remains
outside scope and `--repair` throws `not implemented`. Diagnostics remain local and
do not execute harness sessions. No source/test implementation is included in this
decomposition.


## Review follow-up

The [agreed review changes](REVIEW.md) are split into two deliveries. Tests precede
implementation tasks; both tickets include the required per-file verification.

| Ticket | Purpose | Dependencies |
| --- | --- | --- |
| [0038 — Correct doctor installation resource and launcher checks](../../tickets/open/0038-correct-doctor-installation-resource-and-launcher-checks.md) | Reject special resource files without opening them, check actual POSIX launcher execute access, and preserve literal PATH whitespace. | 0035 (closed) |
| [0039 — Report verbose doctor progress and diagnostic context](../../tickets/open/0039-report-verbose-doctor-progress-and-diagnostic-context.md) | Announce phases/checks with useful context on verbose stderr, including bootstrap, while preserving final collected Log.output results. | 0038, 0037 (closed) |

0038 covers the first three review items in one installation-only change. 0039
covers progress throughout orchestration, installation, project, configuration, and
harness diagnostics. Its dependency on 0038 orders their shared installation file
and tests; 0037 supplies the completed harness flow. No source/test implementation
is included in this decomposition.
