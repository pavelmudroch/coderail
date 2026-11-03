---
id: "0002"
slug: "support-flattened-resources-in-compiled-distributions"
title: "Support flattened resources in compiled distributions"
status: "open"
created_at: "2026-11-03T13:10:59.011Z"
updated_at: "2026-11-03T13:10:59.011Z"
dependencies: []
---

# Support flattened resources in compiled distributions

Make installed commands find resources under the physical installation root, including first bootstrap and custom roots, while retaining source-checkout behavior. This ticket can proceed independently of release downloading.

## Tasks

1. [ ] Add runtime-root and installed-resource lookup regression tests
2. [ ] Support compiled layout and audit resource consumers

## Task details

### 1. Add runtime-root and installed-resource lookup regression tests

Scope: extend `tests/runtime/context.test.ts` and relevant resource-reader/consumer tests using temporary distribution trees and an injectable executable identity where needed.

Expected outcome: cover physical `<root>/libexec/cr-<identity>` and Windows `.exe` entrypoints, Unix launcher resolution, direct bootstrap invocation before `bin/` or a manifest exists, default `~/.coderail`, and custom roots containing spaces. Assert compiled resources resolve to `<root>/instructions/` and `<root>/templates/` and source development continues to use repository assets.

Validation: fixtures contain no installed `assets/` directory; instruction-reading and existing template consumers use the correct root outside an initialized project. Existing context and resource-reader tests remain meaningful.

### 2. Support compiled layout and audit resource consumers

Scope: inspect `src/runtime/context.ts`, `src/path.ts`, instruction loading, template commands, and configuration lookup; change only consumers that need layout support. Keep all runtime/resource-path changes in this ticket to avoid overlap with upgrade orchestration.

Expected outcome: derive the chosen root from the resolved physical executable in `libexec`, without an installation-directory flag. Use flattened installed resources and preserve repository development lookup. Document the path contract for upgrade helpers. Audit placeholder template functionality without expanding this ticket into implementing unrelated template commands or harness install/uninstall behavior.

Validation: task 1 tests and affected existing consumer tests pass. Verify the compiled-path branch with a temporary native compile/smoke run when supported locally; record host limitations for other platforms. Run `cr verify ./src/<changed-file>.ts` and `cr verify ./tests/<changed-file>.test.ts` for changed source/test files.

## References

- [Upgrade layout and bootstrap contract](../../plans/upgrade-command/IDEA.md)
- [Runtime context](../../../src/runtime/context.ts)
- [Path constants](../../../src/path.ts)
- [Instruction loader](../../../src/commands/helpers/get-instruction-files.ts)
- [Template commands](../../../src/commands/template.ts)
- [Global configuration lookup](../../../src/conf/get-global-configuration-file.ts)
- Integration consumer: ticket 0006.
