---
id: "0022"
slug: "bootstrap-and-repair-stable-installations-with-installsh"
title: "Bootstrap and repair stable installations with install.sh"
status: "active"
created_at: "2026-11-05T10:46:59.827Z"
updated_at: "2026-11-05T11:32:52.430Z"
dependencies:
  - "0018"
  - "0019"
  - "0020"
---

# Bootstrap and repair stable installations with install.sh

Turn root `install.sh` into a Linux/macOS x64/arm64 installer using the existing upgrade command as its installation boundary. Depends on 0018 for safe latest publication, 0019 for release selection/pinning semantics and 0020 for upgrade-owned PATH setup. A Windows PowerShell installer and local-package API are deferred.

## Tasks

1. [ ] Specify bootstrap, rerun and cleanup behavior with isolated fixtures
2. [ ] Implement verified stable bootstrap for supported hosts
3. [ ] Handle existing installations and safe failure cleanup
4. [ ] Document and exercise complete installation flows

## Task details

### 1. Specify bootstrap, rerun and cleanup behavior with isolated fixtures

Scope: add shell-installer subprocess coverage under `tests/`, using fake host/download/checksum/extraction tools and temporary roots; use existing package fixtures where practical. Define executable-health checks that distinguish an unusable CLI from a valid CLI whose upgrade fails.

Expected outcome: cover Linux/macOS x64/arm64 mapping, unsupported hosts, missing prerequisites, stable/canary filtering, absent/invalid latest, one-time latest resolution and pinned downloads/bootstrap upgrade. Cover download/checksum failures before execution, default and custom roots containing spaces, first install, valid rerun, broken/incomplete roots, alternate roots, conflicts, preserved user templates/unrelated files and interrupted/error cleanup.

Validation: assert a valid installation invokes its existing CLI with `upgrade --version latest` and does not download bootstrap assets. A conflict/network failure from that valid CLI fails once without bootstrap fallback. Fresh bootstrap upgrades use the exact resolved version, never latest again. Cleanup removes only installer-created temporary/unused files and preserves active executables and installed data. Run per-file `cr verify` for new or modified tests.

### 2. Implement verified stable bootstrap for supported hosts

Scope: implement root `install.sh` as a sh-compatible script. Detect host OS/architecture, select default `~/.coderail` or `CODERAIL_INSTALL_ROOT`, and use the existing published ZIP/checksum naming contract. Keep bootstrap logic in this file.

Expected outcome: resolve GitHub's designated latest once, reject invalid stable identities/drafts/prereleases, pin downloads to that publication, verify SHA-256 before extracting/executing cr, and stage the executable at a unique physical location directly under selected root/libexec. Invoke it by physical path with upgrade pinned to the selected exact version. Reuse upgrade for manifest/resources/launcher activation, accepting its second archive download. Quote paths correctly and diagnose unsupported hosts or missing tools clearly.

Validation: task 1 fresh-install/platform/failure cases pass; inspect `sh -n install.sh` and available shell lint results. Test that changing latest after resolution does not change the bootstrapped version and checksum failure never executes downloaded code.

### 3. Handle existing installations and safe failure cleanup

Scope: extend `install.sh` with selected-root health checks and traps. Rely on existing upgrade conflict protection and bootstrap recognition; change upgrade helpers only if a demonstrated integration gap requires it, with targeted tests.

Expected outcome: healthy installations delegate to their existing CLI, including same-version repair. Broken/incomplete installations bootstrap without deleting existing content or supplying force. A different install-root override creates a separate installation, never relocates or redirects an old installation. Preserve upgrade diagnostics and status; do not retry failed valid upgrades through bootstrap. On failure remove temporary downloads and installer-created unused bootstrap executables, preserving active executables, partial installed state and user data; no rollback is introduced.

Validation: task 1 rerun/conflict/alternate-root/failure cases pass. Simulate failure before and after activation and signals to prove cleanup ownership. Run per-file `cr verify` if any source/tests change.

### 4. Document and exercise complete installation flows

Scope: update installation guidance in `README.md` and run disposable end-to-end checks through the actual compiled CLI and local release fixtures, extending the test harness where needed.

Expected outcome: document fresh installation, CODERAIL_INSTALL_ROOT, reruns/repair, platform limits, prerequisites, partial failure behavior and reload/manual PATH steps. Verify installation exposes only root/bin and leaves PATH setup to upgrade. Demonstrate piped installation can prompt through a terminal, unattended/explicit noninteractive runs print guidance, and PATH-edit failure remains nonfatal.

Validation: exercise first installation, same-version reconciliation, resource repair, preserved user templates, custom roots with spaces and an upgrade failure without fallback. All affected per-file `cr verify` checks pass; no real release publication or developer shell-profile edits are required.

## References

- [Installer plan](../../plans/stable-release-installer/IDEA.md)
- [Bootstrap contract](../../plans/upgrade-command/IDEA.md#agreed-bootstrap-contract)
- [Installer entry point](../../../install.sh)
- [Runtime root discovery](../../../src/runtime/context.ts)
- [Activation and bootstrap recognition](../../../src/commands/upgrade/activation.ts)
- [Release fixtures](../../../tests/commands/upgrade/release-fixture.ts)
- Dependencies: [0018 publisher](0018-promote-complete-stable-releases-without-replacing-newer-defaults.md), [0019 selection](0019-resolve-default-upgrades-from-github-designated-latest.md), [0020 PATH](0020-configure-installation-path-after-successful-upgrades.md)
