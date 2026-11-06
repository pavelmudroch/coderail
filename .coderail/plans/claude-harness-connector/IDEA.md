---
title: "Claude harness connector"
status: "ready"
---

## Outcome

Implement harness connectors, starting with Claude because skill translation is
expected to be simpler. This idea explores the first Claude connector delivery;
Codex remains later work.

## Confirmed decisions

- The first Claude delivery must make installation fully functional: skills,
  global instructions, and subagents, rather than skill translation alone.
- Instruction sources are optional. Missing `instructions/`, `skills/`,
  `agents/`, or general `AGENTS.md` must not fail installation. Discover and
  translate only assets that exist; no sources is a successful no-op. Do not
  add `assets/instructions/AGENTS.md` as part of this work.
- The shared installer must not require a complete instruction bundle or enforce
  harness-specific asset completeness. The connector validates supplied assets:
  a discovered skill directory without `SKILL.md` must produce a connector error,
  including an empty skill directory. Preserve such discovered skills through
  loading so the connector can report the error.
- Optional absence must not mask unrelated filesystem failures (for example,
  unreadable existing files) or existing installation conflict/path protections.
- Represent missing general instructions as
  `globalInstructionFile: InstructionFile | null`; missing skill and subagent
  collections remain empty arrays. Call `translateGlobalInstructions` only when
  the file is present. Keep `HarnessConnector` signatures unchanged.
- Validate supplied skill and subagent frontmatter in the Claude connector.
  Both require nonblank string `name` and `description` properties. A skill's
  `name` must exactly match its source directory name. A subagent's `name` must
  exactly match its filename without `.md`, excluding parent directories:
  `agents/review/worker.md` requires `name: worker`.
- Instruction Markdown must be valid UTF-8. Preserve binary supporting assets
  unchanged. Preserve frontmatter and add no defaults; required metadata checks
  supplement the previously agreed root-level `SKILL.md` requirement.
- Translation failures identify the source path and reason. All translation,
  destination-path validation, and destination inspection must finish before
  writes for that harness. The shared install command already owns this ordering;
  retain it rather than adding a separate connector inspection phase.
- Support optional boolean `user-invocable` in skill frontmatter. Preserve both
  explicit `true` and `false` values during Claude translation and leave omission
  unchanged so Claude's native default applies. Preserve the independent
  `disable-model-invocation` field as well. This does not select new invocation
  policies for existing bundled skills.
- Keep `AGENTS.md` as the common source for general instructions; connectors
  choose harness-native output locations. Claude writes `rules/coderail.md`
  relative to its installation home, in both global and local scope, without
  path-scoping frontmatter so the instructions load at startup. Coderail owns
  this dedicated file and leaves existing `CLAUDE.md` files untouched.
- Use native `CLAUDE_CONFIG_DIR` for custom global homes in both install and
  uninstall. Add no Coderail-specific home argument. Local installations remain
  rooted at `<projectRoot>/.claude` independently of that environment variable.
- For global operations, an unset or empty `CLAUDE_CONFIG_DIR` uses `~/.claude`.
  Accept absolute overrides directly; reject relative overrides with a clear
  error rather than resolving them against the working directory. Local
  operations ignore the override, including invalid relative values.
- Translate every `<skill>skill_name</skill>` occurrence to `/skill_name`
  anywhere in translated instruction text: skill files, nested supporting files,
  subagents, and general instructions. Do not limit replacement to `SKILL.md`
  or particular Markdown sections; literal examples and code blocks are included.
  Preserve the referenced name, including names absent from the current bundle.
  Preserve all other content and do not mutate caller-owned inputs.

## Current understanding

- `src/harness/claude.ts` and `src/harness/codex.ts` are placeholders.
- The existing `HarnessConnector` contract binds an installation target at
  construction and exposes an absolute home and three byte-based translations.
  Translation outputs are relative to that home. Shared install/uninstall code
  owns discovery, path validation, manifests, conflicts, and filesystem mutation.
- Currently `cr install claude` unconditionally loads all instruction categories
  and translates global instructions. The optional-source decision requires
  changes to shared loading and conditional translation, alongside the connector.
- Bundled skills use Claude-supported frontmatter (`name`, `description`, and
  optional `disable-model-invocation`) and relative supporting-file references.
  The bundled worker subagent uses `name` and `description` frontmatter.
- Claude documents personal and project skill/agent directories under `.claude`,
  and supports both personal and project `.claude/CLAUDE.md` instruction files.
- The ready local-installation idea already establishes target-bound connectors
  and separate homes/manifests across scopes and harnesses.
- Claude supports `user-invocable: false` in skill frontmatter to disable direct
  user invocation while retaining model invocation. Its default is `true`.
  This is independent of `disable-model-invocation`. No change to bundled skill
  invocation policies has been requested or agreed.

## Agreed layout and module boundaries

- Reuse existing shared modules (`@md`, `@fs`, `@path`, and other relevant
  project utilities) through their established APIs. Use `Md.parse` for
  Markdown/frontmatter inspection; do not introduce connector-specific Markdown
  or frontmatter parsing/serialization functions. Keep validation separate from
  output generation so inspection does not reserialize unchanged source bytes.
  Reuse `Fs` for filesystem operations it supports in shared loading/install code;
  the connector itself remains a byte-based translator without filesystem mutation.
  If a shared capability needs extending, place it in its owning shared module
  rather than duplicating it inside the connector.
- Support global and local installation using the existing connector contract.
- Use `CLAUDE_CONFIG_DIR` globally when configured, otherwise `~/.claude`;
  use `<projectRoot>/.claude` locally regardless of the global override. Resolve
  the absolute home once for the connector lifetime.
- Translate skills by prefixing `skills/<name>/` to each relative source path,
  preserving the supporting-file tree and content except the agreed skill-tag
  replacement.
- Map subagents to `agents/<filename>`, applying the same skill-tag replacement.
- Retain shared installation/removal and manifest behavior.
- Keep Claude-specific implementation in `src/harness/claude.ts`, with connector
  tests following repository conventions. Shared optional-source loading belongs
  in `src/commands/helpers/get-instruction-files.ts` and conditional translation
  in `src/commands/install.ts`. No new connector abstraction is justified.
- Retain the existing public constructor and `HarnessConnector` signatures:
  `new ClaudeConnector(target)`, `name`, `home`, the three translation methods,
  and disposal. Remove the unused placeholder `manifestPath` getter from Claude;
  shared commands already derive the manifest path from home.
- Map subagent paths under `agents/` without flattening nested directories.
  Translation preserves bytes except the agreed skill-tag replacement and does
  no filesystem mutation. Shared operations retain aggregate path validation,
  conflict handling, and manifest ownership. Tag translation remains internal
  to the Claude connector; no new public API is needed.

## Readiness

No consequential decisions remain open. The existing connector interface and
module boundaries are retained, with the agreed nullable shared instruction-file
contract. No decomposition is needed. Private metadata validation and skill-tag
translation helpers, binary detection, and detailed test organization remain
implementation choices within the agreed behavior, shared-module reuse, and
byte-preservation requirements. Markdown/frontmatter processing belongs to `@md`.

## Verification expectations

- Review shared-module reuse: connector metadata inspection uses `@md`, supported
  filesystem operations use `@fs`, and no duplicate Markdown/frontmatter parser
  or serializer is introduced. Preserve the existing non-absence error contract
  when selecting shared filesystem helpers.
- Verify global/local destination paths and manifest isolation.
- Cover independently missing general instructions, skills and agents directories,
  and the whole instruction root. No sources must succeed without filesystem
  mutation or removing previously installed assets. Cover partial bundles and
  empty/malformed discovered skills: missing `SKILL.md` fails in the connector.
- Verify non-absence read failures remain visible and that omitted general
  instructions never call `translateGlobalInstructions`.
- Cover missing/malformed frontmatter, missing/non-string/blank required metadata,
  and mismatched skill and subagent names, including nested subagent paths.
  Verify errors identify the source and that a failed
  translation or destination inspection prevents all writes for that harness,
  including when earlier assets are valid.
- Cover invalid UTF-8 in instruction Markdown and unchanged binary supporting
  assets; metadata validation must not reserialize or otherwise rewrite content.
- Cover global `CLAUDE_CONFIG_DIR` overrides and their independence from local
  installation targets, including unset/empty fallback, accepted absolute paths,
  and rejected relative paths globally. Local operations ignore relative overrides.
- Verify content preservation except the agreed tag replacement, nested
  supporting files, binary assets, and caller input ownership.
- Cover multiple and repeated skill tags in skills, nested supporting files,
  general instructions, and subagents, including frontmatter and code examples.
  Verify referenced names are preserved even when not installed, and unrelated
  markup and ordinary slash commands remain unchanged.
- Cover `user-invocable: true`, `user-invocable: false`, and omission, including
  combinations with `disable-model-invocation` to verify neither field is lost
  or rewritten.
- Verify representative bundled assets and real-connector install/uninstall
  round trips, including existing-file protection.
- Run `cr verify` for every modified source/test file as required by AGENTS.md
  when implementing. Exploration changes no source/test files.

## References

- `../local-harness-instruction-installation/IDEA.md`
- `src/harness/connector.ts`
- `src/harness/claude.ts`
- `src/harness.ts`
- `src/md.ts`
- `src/fs.ts`
- `src/path.ts`
- `src/commands/install.ts`
- `src/commands/uninstall.ts`
- `src/commands/helpers/get-instruction-files.ts`
- `tests/commands/install.test.ts`
- `tests/runtime/context.test.ts`
- `assets/instructions/skills/`
- `assets/instructions/agents/worker.md`
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/claude-directory
