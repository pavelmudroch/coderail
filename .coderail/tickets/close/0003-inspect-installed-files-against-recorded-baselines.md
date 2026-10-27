---
title: Inspect installed files against recorded baselines
status: closed
depends-on: 0002
reason: done
duplicate-of: 
---

# Inspect installed files against recorded baselines

Allow callers to compare recorded entries with current files without accepting
edits as a new baseline. Depends on ticket 0002 for safe descendant resolution and
fingerprinting, and transitively on ticket 0001 for validation and persistence.

## Tasks

1. [x] Add inspection behavior and failure tests
2. [x] Implement baseline inspection and complete the public facade
3. [x] Validate the complete manifest helper

## Task details

### 1. Add inspection behavior and failure tests

Scope: add `tests/install-manifest/inspect.test.ts` through the public facade,
using existing filesystem test conventions and reliable failure fixtures.

Expected outcome:

- Cover unchanged files, different-size edits, equal-size edits, absent leaves,
  absent ordinary ancestors, ordered results, and empty manifests.
- Cover replacement directories, other non-regular leaves, and live or dangling
  leaf symlinks as `modified`, without reading through symlinks.
- Reject symlink ancestors, non-directory ancestors, invalid paths, invalid
  runtime manifests, and missing or invalid roots even for empty manifests.
- Cover legitimate caller root aliases, sibling-prefix escape attempts, and
  access/read errors that must throw rather than become status results.
- Verify inspection leaves the supplied manifest and installed files unchanged,
  including edited contents, and ignores unlisted destinations.

Validation: tests distinguish missing ordinary descendants from invalid roots,
unsafe traversal, and access errors. Exercise the capture/save/load/inspect
lifecycle and verify inspection does not update the saved baseline.

### 2. Implement baseline inspection and complete the public facade

Scope: implement `inspect(root, manifest)` under `src/install-manifest/`, reusing
strict manifest validation, canonical root/descendant resolution, and raw-byte
fingerprinting. Complete the exact exported facade contract from the spec.

Expected outcome:

- Validate runtime inputs and the existing directory root for every call.
- Return one `{ path, status }` result per recorded entry in manifest order.
- Report `missing` only for absent leaves or ordinary ancestors below the root;
  report `modified` for non-regular leaves or differing size/checksum; otherwise
  report `unchanged`. A size difference may skip hashing, but equal size requires
  checksum comparison.
- Never follow replacement leaf symlinks or descendant symlink ancestors. Throw
  on invalid paths, non-directory ancestors, and access/read failures; return no
  partial inspection results on failure.
- Preserve the baseline and installed files. Keep approval, replacement,
  deletion, entry updates, and untracked-file policy with callers.

Validation: all inspection cases pass through the facade. The final module
exports `ManifestFile`, `Manifest`, `Inspection`, and the matching `InstallManifest`
interface/value with `load`, `save`, `capture`, and `inspect` as specified.

### 3. Validate the complete manifest helper

Scope: run `cr test ./src/install-manifest.ts ./src/install-manifest` and
`cr test ./tests/install-manifest`; fix failures and review coverage against all
specification requirements.

Expected outcome: persistence, capture, inspection, lint/format, and applicable
coverage/mutation checks pass using existing operation-aligned test mappings.

Validation: no facade-only validation, test-map changes, workflow integration,
approval prompts, or modifications to unrelated in-progress work. Confirm empty
inputs, strict schemas, path containment, error propagation, and baseline
immutability are covered across the completed helper.

## References

- [Specification](../../plans/install-manifest-helper/SPEC.md), especially
  Requirements, Relative paths and containment, and Testing decisions
- [Capture prerequisite](0002-capture-installed-file-baselines-safely.md)
- [Persistence and validation](0001-persist-and-validate-install-manifests.md)
- [Idea and caller responsibilities](../../plans/install-manifest-helper/IDEA.md)
- [Test map](../../test_map)
