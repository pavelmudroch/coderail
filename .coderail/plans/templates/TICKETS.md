# Templates tickets

The [approved idea](IDEA.md) and [agreed interfaces](DESIGN.md) are decomposed into six implementation units. The first delivers reusable document persistence; subsequent tickets deliver template management and incrementally complete initialization. The idea remains the behavioral specification and DESIGN.md remains the interface contract.

| Ticket | Purpose | Dependencies |
| --- | --- | --- |
| [0047 — Configuration documents](../../tickets/open/0047-preserve-and-merge-configuration-documents-for-templates.md) | Preserve comments, stringify and merge documents, normalize arrays, and reuse settings validation. | None |
| [0048 — Template management](../../tickets/open/0048-manage-installation-templates-through-the-cli.md) | List, inspect, scaffold, and confirm deletion using installation-relative storage and consistent output. | 0047 |
| [0049 — Safe template initialization](../../tickets/open/0049-apply-template-assets-and-configuration-during-initialization.md) | Preflight assets/settings, copy files, persist merged config, and replace simulated init. | 0047, 0048 |
| [0050 — Startup scripts](../../tickets/open/0050-run-template-startup-scripts-after-applying-project-files.md) | Run the selected script after assets/config and stop later templates on failure. | 0049 |
| [0051 — Overwrite confirmation](../../tickets/open/0051-confirm-conflicting-template-asset-overwrites.md) | Collect force overwrite decisions before copying, including automatic acceptance and decline. | 0050 |
| [0052 — Dry modes](../../tickets/open/0052-preview-template-initialization-and-support-alternate-dry-targets.md) | Preview cumulative effects without writes or initialize an alternate target with full behavior. | 0051 |

0047 owns parser/document/validation changes; 0048 owns catalog and management commands. 0049 introduces application and the initialization bridge. 0050–0052 depend sequentially to order shared changes in application, init, and their tests. Dependencies are declared in CLI-generated ticket front matter; no dependency on unrelated staged work is introduced.

Each ticket places meaningful behavioral tests before implementation and gives each task its scope, expected outcomes, and validation. Implementation must run the per-file `cr verify` commands required by AGENTS.md for every source/test file it modifies and fix failures until passing. This decomposition changes only tickets and this index; it does not implement or verify existing staged source changes.

The completed sequence covers the required extensionless metadata layout, installation-root lookup, config/comment/deduplication rules, per-template preflight, sequential assets/config/startup, overwrite decisions, noninteractive handling, cancellation, no rollback, and both dry modes. Preview tracks known asset/config effects across templates without claiming to predict arbitrary startup effects. Additional metadata and bundled template content remain outside scope.
