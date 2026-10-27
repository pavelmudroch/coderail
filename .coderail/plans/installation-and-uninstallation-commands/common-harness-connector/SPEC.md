## Problem Statement

Shared installation and removal cannot operate consistently until harness connectors expose
installation locations and translated instruction files through one contract. The current connector
interface exposes only a name; it leaves file mapping, content preparation, and filesystem ownership
undefined.

## Goal

Define the common connector contract for Codex and Claude without implementing their native mappings
or the shared installation workflow.

## Solution Overview

Extend `HarnessConnector` with a resolved installation home, manifest location, and separate
asynchronous translations for skills, global instructions, and subagents. Translations consume
loaded bytes and return fully materialized files.

Shared operations discover and load bundled assets, collect translations, validate the complete
desired file set, and manage installed files and manifests. Connectors supply harness-specific
locations and transformations only.

## Requirements

1. Preserve the `HarnessConnector` name, `name` property, and `Disposable` contract. Export the file
   contract alongside it through the harness facade.
2. Expose absolute `home` and `manifestPath` values independently of asset loading or translation,
   allowing uninstall to use only those properties.
3. Resolve home once in the connector constructor and retain it for that instance. A set
   harness-specific environment override takes precedence over the default; empty and relative
   overrides fail. Exact variable names and default locations belong to the native connector scopes.
4. Translate each bundled asset category through its own method. Each method returns a promise of
   zero or more fully materialized destination files; multiple outputs are supported. Unsupported
   assets must fail explicitly unless the native connector specification defines an explicit
   fallback. An empty array must not silently stand for unsupported input.
5. Represent source and destination content as `Uint8Array`. Skill input includes all supporting
   files with paths relative to that skill directory. Global instructions and subagent definitions
   each receive one loaded source file.
6. Destination paths are relative to home. Shared operations validate the entire output set for
   valid contained paths, duplicate destinations, and manifest-path collisions before changing
   installed files.
7. All discovery, loading, mapping, and transformation must finish successfully before shared
   operations change a harness's installed files. Translation rejection fails preparation for that
   harness.
8. Connectors do not discover or load the bundle, manage manifests, inspect conflicts, prompt,
   install or remove files, or report operation outcomes.

## Implementation Decisions

### Public contract

Keep the contract in `src/harness/connector.ts` and re-export its types through `src/harness.ts`,
following the existing harness facade:

```ts
export interface ConnectorFile {
    path: string;
    content: Uint8Array;
}

export interface HarnessConnector extends Disposable {
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

`name` retains the existing harness identifier. The skill `name` argument identifies the source
skill; its files retain their paths relative to the skill directory. Source paths describe source
files, not installation destinations. Translation must not modify caller-provided file records or
content.

Do not expose streams, temporary files, manifest entries, approval options, or filesystem handles
through this interface. A translation promise resolves only after every output byte is available; it
must not defer fallible content work to the installation phase.

### Locations and connector lifetime

Native connectors resolve home in their constructor, retain it for the instance, and derive
`manifestPath` from that home and `Path.INSTALL_MANIFEST_NAME` (currently `.coderail-install`). An
override is a literal absolute path, not a shell expression requiring expansion. Home resolution
does not require an existing directory and does not create one.

Home and manifest access must not load or translate instruction assets. Reusing a connector across
operations reuses its resolved home; environment changes apply only to subsequently constructed
instances. Construct native connectors lazily so installation configuration is not resolved or
validated during module import or CLI usage rendering. Native implementations and their consumers
own that wiring.

### Compile-safe transition

The existing `CodexConnector` and `ClaudeConnector` implementations contain only names and disposal
methods. They must satisfy the extended interface without inventing native mappings or installation
defaults in this scope:

- Preserve their existing names and disposal behavior.
- Add `home` and `manifestPath` getters that throw explicit not-implemented errors.
- Add asynchronous translation methods that reject with explicit not-implemented errors, including
  for empty skill input.

These are temporary compatibility implementations, not supported installation behavior. Native
connector work replaces them and introduces lazy construction before adding constructor-time home
resolution. Preserve the current registry and its consumers during this placeholder transition; name
access and disposal remain safe. Do not introduce a factory, base class, or home-resolution helper
solely for these placeholders. Exact error wording is not a public contract.

### Shared preparation boundary

Shared operations own bundle discovery and loading and invoke the appropriate translation for every
bundled root instruction, skill, and agent. They aggregate all outputs before preflight or
filesystem mutation. This specification defines that boundary; implementing the preparation workflow
belongs to the operations scope.

Output paths follow the existing `InstallManifest` canonical relative-path contract:
slash-separated, nonempty, and without absolute or drive-qualified paths, backslashes, NUL, empty
components, or `.` and `..` components. Reject invalid paths rather than silently normalizing them.
Duplicate detection spans all translations for a harness. Reject destinations resolving to the
manifest.

Shared operations own runtime validation and safe filesystem containment, including descendant
symlink checks. `Path.isWithin` alone is insufficient because its current prefix check also accepts
sibling names sharing a prefix. Do not change that helper in this scope.

### Markdown compatibility

Native translations can wrap UTF-8 bytes for `Md.parse` and fully consume `Md.toStream` output back
into bytes. The parsed body stream is single-use; streams must not escape translation. Supporting
files can remain binary.

The current helper supports flat scalar frontmatter and scalar arrays, not arbitrary YAML. Current
bundled assets fit that limitation. Native schema decisions and any future unsupported-data fallback
belong to native connector specifications; this contract does not expand the Markdown parser.

## Testing Decisions

Use repository `Deno.test` and `@std/expect` conventions, with tests under `tests/harness/`
corresponding to the concrete connector modules.

For this scope, verify:

- The facade exports both types and concrete implementations satisfy the required interface,
  including asynchronous translations and `Disposable`.
- Importing the harness facade and accessing existing connector names does not resolve installation
  configuration or throw; disposal remains safe.
- Both temporary connectors explicitly fail home/manifest access and reject all three translations
  rather than returning fabricated locations or empty output.

Native connector tests subsequently verify constructor-time default/override resolution, stable
per-instance locations after environment changes, fresh resolution for new instances, lazy
construction, native mappings, supporting-file byte preservation, multiple outputs, and complete
materialization or rejection. Operations tests subsequently verify complete preparation before
writes and aggregate destination validation. Do not implement those sibling behaviors just to test
them here.

After implementation, run:

```sh
cr test ./src/harness.ts ./src/harness/connector.ts ./src/harness/codex.ts ./src/harness/claude.ts
cr test ./tests/harness
deno check ./src/harness.ts ./src/commands/install.ts ./src/commands/uninstall.ts
```

The current `.coderail/test_map` runs lint and formatting for top-level source files. Nested source
entries additionally run corresponding tests and coverage when present; explicit test-file entries
also run mutation testing. Run the explicit behavior-test paths so facade checks do not substitute
for tests. No test-map change is required.

## Out of Scope

- Native Codex/Claude destinations, environment variable names, defaults, content transformations,
  discovery verification, and fallback choices.
- Shared bundle discovery/loading, lazy native connector construction wiring, destination validation
  implementation, manifest lifecycle, confirmations, and file changes.
- Command parsing, harness selection, result reporting, or exit status changes.
- Project-local installation, shared `~/.agents` installation, section merging, temporary-file
  staging, or Markdown parser expansion.
- Repairing unrelated incomplete harness helpers or existing command tests.

## Assumptions

- The approved common connector idea is one leaf implementation scope. Its sibling scopes remain
  separate even where this contract specifies their duties.
- Bundled sources and translated outputs fit in memory.
- Rejecting placeholders are an acceptable intermediate state for the currently unfinished native
  connectors; installation remains unavailable until sibling implementation is complete.
- Loaded source records and bytes remain caller-owned and read-only by convention; the approved
  mutable TypeScript signatures remain unchanged.

## Further Notes

The parent idea retains shared file-protection, confirmation, ownership-transfer, and failure
policies. This contract is ready for implementation and for the operations specification to consume;
native connector specifications must still resolve their own open questions.

Preserve existing working-tree changes in `src/commands/install.ts`, `src/commands/uninstall.ts`,
and `src/path.ts`. Research also found unrelated incomplete helpers in `src/harness/get.ts` and
`src/harness/list.ts`, and existing command usage tests that differ from the in-progress command
usage. These are outside this scope.

## Ticket Plan

No tickets created. This specification covers the common contract, minimal concrete-stub
compatibility, and their tests as one implementation scope.
