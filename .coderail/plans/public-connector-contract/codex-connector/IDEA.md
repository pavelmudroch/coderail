---
title: Codex connector
status: forging
---

## Desired Outcome

A bundled Codex connector satisfies the public contract, provides the existing Codex installation and uninstallation behavior through core-managed lifecycle, and implements prompt-and-wait against the Codex harness.

## Understanding

- Codex is the first connector because its behavior can be tested directly.
- Keep `install_global_instruction.sh`, `install_skill.sh`, `install_sub_agent.sh`, and `prompt_and_wait.sh` under `connectors/codex/`. Provide parsed `connector.conf` metadata with `contract_version=1.0.0`, `default_home=$HOME/.codex`, and `default_command=codex`; no separate default-home operation or version-marker file belongs to the revised contract.
- Core resolves the metadata home default with explicit leading `$HOME` substitution when needed and applies configured or environment overrides. Core passes the final command to `prompt_and_wait.sh`; the operation uses that command without maintaining a separate default. Metadata is not sourced or evaluated as shell code.
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
