---
title: Claude instruction connector
status: forging
---

## Desired Outcome

Supply Claude-native destinations and transformed content for all bundled coderail
instructions, skills, and agents.

## Understanding

- Inherit the agreed policies in [the parent idea](../IDEA.md).
- Own Claude-specific paths and content transformation, installation root, and
  manifest location, conforming to the
  [common harness connector](../common-harness-connector/IDEA.md) contract.
- Shared operations own manifest lifecycle, preflight, confirmation, and file
  installation/removal. Do not duplicate that workflow in the connector.

## Decisions

- Install globally for the current user in harness-specific locations.
- Skills go into `~/.claude/skills`; never install into shared `~/.agents`.
- Map all bundled asset types, adapting names and formats. Manage whole files
  only; do not merge sections into existing files.
- Claude supports Markdown agent files with front matter.

## Open Questions

- Resolve exact destinations for root instructions and agents, installation root,
  manifest location, and configuration-directory overrides.
- Resolve required content transformations and verify Claude discovery.
- Decide an explicit fallback if any bundled asset cannot be supported.
