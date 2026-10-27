---
title: Common harness connector
status: ready
---

## Desired Outcome

Define a common connector interface that shared install/uninstall operations can
consume and harness-specific connectors can implement consistently.

## Understanding

- Inherit the agreed policies in [the parent idea](../IDEA.md).
- Own the shared connector contract for installation root, manifest location,
  destination paths, and transformed instruction content.
- Codex and Claude connectors own harness-specific mapping and transformation.
- Shared operations own manifest lifecycle, conflict preflight, confirmation,
  file changes, and reporting. Connectors do not perform those operations.
- Provide separate translation functions for skills, global instructions
  (`AGENTS.md`), and subagent definition files. Each translation can produce
  multiple destination files.
- Provide the harness home directory: its configuration/installation root, with
  a harness-specific environment-variable override.

## Constraints

- Prepare the complete desired file set and transformed content in memory before
  shared operations change installed files. Mapping or transformation failures
  fail that harness before changes begin.
- Cover all bundled instruction asset types: root instructions, skills, and
  agents. Unsupported types require an explicit fallback rather than omission.
- Preserve whole-file management and harness-specific global installation.

## Decisions

- Resolve this contract before
  [install and uninstall operations](../install-and-uninstall-operations/IDEA.md)
  proceeds to specification and tickets.
- Both harness-specific connectors conform to this common contract.
- Translations receive loaded source files rather than filesystem paths. Shared
  preparation owns bundle discovery and loading.
- All translation methods return promises of fully materialized file arrays,
  allowing reuse of `Md.parse` and `Md.toStream` without exposing output streams
  to shared install operations.
- Resolve home once in the connector constructor and retain it for that instance.
  Use the harness-specific environment override when set; otherwise use the
  harness default. Overrides must be absolute paths; reject empty or relative
  values. Exact variable names and defaults belong to the harness-specific
  connector ideas.
- Construct connectors lazily so installation configuration is not resolved or
  validated during module import or CLI usage rendering. Reusing an instance
  does not reread the environment between operations.
- Expose the resolved home without loading or translating assets, so uninstall
  can use it independently.
- Expose `manifestPath` as an absolute path formed from home and the existing
  `Path.INSTALL_MANIFEST_NAME`. It is available without translating assets.
- Files carry a path and `Uint8Array` content. Keep inputs and outputs fully in
  memory; do not expose content streams or introduce temporary-file staging.
  Skill inputs include all supporting files with paths relative to the skill
  directory. Global instructions and subagent definitions each receive one
  source file.
- Output paths are relative to the resolved harness home. Shared operations
  reject paths outside home, duplicate destinations, and manifest-path collisions
  before writing anything.

## Interface

Extend the existing `HarnessConnector`, preserving its name and disposal contract:

```ts
interface ConnectorFile {
    path: string;
    content: Uint8Array;
}

interface HarnessConnector extends Disposable {
    readonly name: string;
    readonly home: string;
    readonly manifestPath: string;

    translateSkill(
        name: string,
        files: ConnectorFile[],
    ): Promise<ConnectorFile[]>;

    translateGlobalInstructions(
        file: ConnectorFile,
    ): Promise<ConnectorFile[]>;

    translateSubagent(
        file: ConnectorFile,
    ): Promise<ConnectorFile[]>;
}
```

## Compatibility Context

- Reuse `src/md.ts` for Markdown frontmatter parsing and serialization. Its
  stream interface can wrap in-memory UTF-8 content; it does not require file I/O.
- `Md.parse` is asynchronous and returns a single-use body stream. Translation
  must consume generated output fully before shared operations change files.
- The existing frontmatter helper supports flat scalar values and scalar arrays,
  not arbitrary YAML. Harness-specific schemas must account for this boundary.
- Current bundled skills and the worker agent use only supported string and
  boolean frontmatter fields. No current bundled asset requires broader YAML
  support; this limitation does not block the common connector contract.

## Assumptions

- Bundled instruction assets and their translated outputs are small enough to
  prepare fully in memory.
