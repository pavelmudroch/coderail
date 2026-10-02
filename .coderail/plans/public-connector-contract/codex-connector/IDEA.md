---
title: Codex connector
status: forging
---

## Desired Outcome

A bundled Codex connector satisfies the public contract, provides the existing Codex installation and uninstallation behavior through core-managed lifecycle, and implements prompt-and-wait against the Codex harness.

## Understanding

- Codex is the first connector because its behavior can be tested directly.
- `connectors/codex/` currently contains only shebangs in `prompt.sh`, `install_global_instruction.sh`, `install_skill.sh`, and `install_sub_agent.sh`. Keep the three `install_*` operation files, add `default_home.sh`, and rename `prompt.sh` to `prompt_and_wait.sh` when implementing the connector.
- The connector takes over Codex-specific paths, configuration, and rendering choices that core currently handles.
- Existing Codex-generated files remain governed by per-harness manifest ownership, safe path handling, and confirmation behavior.

## Constraints

- All scripts must be pure POSIX shell.
- Preserve the established Codex `cr install` and `cr uninstall` user experience unless a deliberate change is agreed.
- Implement the public connector contract established by the parent and detailed in the core integration sibling's specification.

## Boundary

- Implement and verify Codex-specific instruction translation and prompt-and-wait. Core discovery, packaging, and command dispatch belong to the core integration child.
- `cr loop` orchestration remains outside this child.

## Open Questions

- Which existing Codex install and uninstall behaviors need explicit compatibility coverage in the connector specification?
- Once the public contract is specified, how should Codex implement the defined inputs, outputs, and status behavior?
