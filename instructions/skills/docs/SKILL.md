---
name: docs
description: Use for guidance when updating base docs (README, CHANGELOG) files.
---

# Docs

Use for `README.md` and `CHANGELOG.md`. Keep docs concise, accurate to repo behavior, and in existing style. Verify commands/files before documenting. Do not invent features, claims, badges, or roadmap.

If not specified otherwise, update docs based on changed files `git diff --name-only HEAD^ HEAD`. If a change is not user-facing, do not document it.
Especially read the SPEC, REVIEW or RESEARCH markdown files, optionally any closed tickets. Read changed source code only if absolutely needed.

## CHANGELOG.md
Follow Keep a Changelog 1.1.0: https://keepachangelog.com/en/1.1.0/

- Write for humans; summarize notable user-facing changes, not commit logs.
- Keep `## [Unreleased]` first. Put latest releases before older releases.
- Release heading: `## [x.y.z] - YYYY-MM-DD`; use ISO dates. Mark pulled releases with `[YANKED]`.
- Group bullets only under used categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- One concise change per bullet. Mention breaking changes, removals, deprecations, and security fixes clearly.
- On release: move `Unreleased` bullets into the new version, recreate empty `Unreleased`, update comparison links if present.
- Do not rewrite released history except to correct mistakes or add missing important notes.

## README.md
- Start with project name and 1-3 sentence description: what it is, who it is for, why it exists.
- Include useful sections: Table of Contents, Installation, Usage, Configuration, Development, Testing, Troubleshooting, Contributing, License.
- Installation: list prerequisites and exact commands.
- Usage: show minimal quickstart and common examples; include expected output/paths when helpful.
- Prefer short sections and links to deeper docs. Remove or update stale text touched by the change.
