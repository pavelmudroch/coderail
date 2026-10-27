---
title: Define the common harness connector contract
status: closed
depends-on: 
reason: done
duplicate-of: 
---

# Define the common harness connector contract

Expose installation locations and asynchronous, byte-based asset translations
through the harness facade. Keep existing Codex and Claude connectors compile-safe
with explicit rejecting placeholders until their native implementations arrive.
This ticket has no dependencies on existing tickets.

## Tasks

1. [x] Add connector contract and compatibility tests
2. [x] Extend the public connector contract and facade exports
3. [x] Add explicit temporary implementations to both native connectors
4. [x] Run contract and compatibility checks

## Task details

### 1. Add connector contract and compatibility tests

Scope: add tests under `tests/harness/` corresponding to `codex.ts` and
`claude.ts`, using repository `Deno.test` and `@std/expect` conventions. Include
facade type checks and registry compatibility coverage.

Expected outcome:

- Both `ConnectorFile` and `HarnessConnector` are importable from
  `src/harness.ts`; both concrete connectors satisfy the extended interface,
  promise-returning translations, and `Disposable` contract.
- Importing the facade, accessing registry connector names, and disposing
  connectors remain safe without resolving installation configuration.
- Both connectors explicitly throw on `home` and `manifestPath` access and
  reject each translation, including a skill with no files. Do not assert exact
  error wording or accept fabricated locations or successful empty output.

Validation: tests distinguish synchronous location-access failures from rejected
translation promises and exercise both connectors. Keep native location,
transformation, and shared preparation behavior outside these tests.

### 2. Extend the public connector contract and facade exports

Scope: update `src/harness/connector.ts` and type re-exports in
`src/harness.ts`, following the exact public signatures in the specification.

Expected outcome:

- Export `ConnectorFile` with `path: string` and `content: Uint8Array`.
- Preserve `HarnessConnector`, its readonly `name`, and `Disposable`; add
  readonly `home: string` and `manifestPath: string`.
- Add `translateSkill(name: string, files: ConnectorFile[])`,
  `translateGlobalInstructions(file: ConnectorFile)`, and
  `translateSubagent(file: ConnectorFile)`, each returning
  `Promise<ConnectorFile[]>`.
- Document source-relative skill paths, caller ownership of input records and
  bytes, fully materialized outputs relative to home, multiple outputs, and
  explicit rejection of unsupported assets. An empty result must not silently
  represent unsupported input.
- Keep discovery/loading, aggregate path validation, manifest ownership, and
  filesystem mutation with shared operations; expose no streams, filesystem
  handles, manifest entries, or approval options.

Validation: facade type checks pass with the approved mutable signatures; no
native mapping, home-resolution helper, preparation workflow, or path-validation
implementation is introduced.

### 3. Add explicit temporary implementations to both native connectors

Scope: update `src/harness/codex.ts` and `src/harness/claude.ts` to satisfy the
extended contract without implementing native installation behavior.

Expected outcome:

- Preserve current names and disposal behavior.
- Add `home` and `manifestPath` getters that throw explicit not-implemented
  errors.
- Add asynchronous translation methods that reject with explicit
  not-implemented errors for every input, including empty skill input.
- Preserve the existing registry and consumers; name access and disposal remain
  safe. Do not add constructors resolving configuration, lazy factories, base
  classes, or placeholder-only helpers.

Validation: both connectors satisfy the interface and pass the compatibility
tests without discovering assets, mutating source records or bytes, resolving
locations, or changing installed files.

### 4. Run contract and compatibility checks

Scope: run the specification's required checks after implementation and fix
failures caused by this ticket:

```sh
cr test ./src/harness.ts ./src/harness/connector.ts ./src/harness/codex.ts ./src/harness/claude.ts
cr test ./tests/harness
deno check ./src/harness.ts ./src/commands/install.ts ./src/commands/uninstall.ts
```

Expected outcome: source lint/format checks, explicit connector behavior tests,
and consumer type checks pass. No test-map change is required.

Validation: run behavior tests explicitly because facade checks alone do not
run them. Preserve existing changes in `src/commands/install.ts`,
`src/commands/uninstall.ts`, and `src/path.ts`; report unrelated failures without
repairing incomplete harness helpers or existing command usage tests.

## References

- [Specification](../../plans/installation-and-uninstallation-commands/common-harness-connector/SPEC.md), especially Public contract, Compile-safe transition, and Testing Decisions
- [Idea](../../plans/installation-and-uninstallation-commands/common-harness-connector/IDEA.md)
- [Connector contract](../../../src/harness/connector.ts)
- [Harness facade and registry](../../../src/harness.ts)
- [Codex connector](../../../src/harness/codex.ts)
- [Claude connector](../../../src/harness/claude.ts)
- [Test map](../../test_map)
