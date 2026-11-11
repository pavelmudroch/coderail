# Doctor command tickets

The [approved idea](IDEA.md) is split into three incremental deliveries. Each ticket
places regression tests before implementation and requires per-file source/test
verification under AGENTS.md. The idea remains the behavioral specification.

| Ticket | Purpose | Dependencies |
| --- | --- | --- |
| [0035 — Diagnose installation health through doctor bootstrap](../../tickets/open/0035-diagnose-installation-health-through-doctor-bootstrap.md) | Make doctor run before normal startup, collect installation findings in source/compiled layouts, and render manual guidance with exit status. | None |
| [0036 — Diagnose project initialization and configuration](../../tickets/open/0036-diagnose-project-initialization-and-configuration.md) | Add nearest-project discovery, initialization checks, independent configuration diagnostics, and Conf-owned fallback preserving explicit global flags. | 0035 |
| [0037 — Diagnose harness instruction integrity and executable availability](../../tickets/open/0037-diagnose-harness-instruction-integrity-and-executable-availability.md) | Inspect global/local harness instruction manifests and check only the configured harness executable. | 0036 (transitively 0035) |

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
