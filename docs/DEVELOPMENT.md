# Developing CodeRail

[User guide](../README.md) · [Release and packaging guide](RELEASING.md)

## Table of contents

- [Runtime and tooling](#runtime-and-tooling)
- [Style commands and configuration](#style-commands-and-configuration)
- [Lint rules and compatibility](#lint-rules-and-compatibility)
- [Application checks](#application-checks)
- [Existing style violations and CI](#existing-style-violations-and-ci)

## Runtime and tooling

Deno remains the application runtime, compiler, test runner, and authoritative type checker.
Bun is used only for style tooling; no package installation or `tsconfig.json` is needed.

`bun lint` currently requires **Bun canary**. Stable Bun 1.4.4 has `bun fmt`, but no `bun lint`.
This configuration was verified with the globally installed `1.4.4-canary.1+b9f2ec363` from the
[official canary release](https://github.com/oven-sh/bun/releases/tag/canary).
Install that build on your PATH (or use `bun upgrade --canary` to update an existing installation).
Check `bun --revision` and `bun lint --help` before running the style commands.

## Style commands and configuration

| Command | Purpose |
| --- | --- |
| `bun fmt src tests tools` | Format TypeScript in `src`, `tests`, and `tools` with Bun |
| `bun fmt --check src tests tools` | Check formatting without writing files |
| `bun lint src tests tools` | Check Bun lint rules and formatting without writing files |
| `bun lint --fix src tests tools` | Apply Bun lint fixes, including missing braces and formatting |

Bun uses 4 spaces, single quotes, semicolons, trailing commas, LF newlines, and a 100-character
line width. Defaults supply semicolons, trailing commas, and LF. `curly = ["error", "all"]`
requires braces for every control-flow body, and `bun lint --fix` inserts them. See Bun's
[curly rule](https://bun.com/docs/lint/rules/eslint/curly) and
[formatter configuration](https://bun.com/docs/format). `bun/format`
checks and fixes formatting during linting, so a separate formatter pass is unnecessary.
`cr verify` also uses Bun's combined lint/fix pass before its existing Deno tests and coverage.

## Lint rules and compatibility

The old explicit Deno lint rules have Bun equivalents, including explicit return types, no `any`,
unused variables, restricted-name shadowing, sparse arrays, and optional-chain assertions.
Bun's return-type rule allows function expressions to match the previous Deno policy.
`consistent-type-imports` preserves type-only import checking without resolving modules.
The existing fallthrough exception is preserved. Additional recommended Deno checks absent from
Bun's defaults are enabled explicitly in `bunfig.toml`.

Bun alone handles linting. Deno's deprecated API, versioned import, sloppy import, legacy import
assertion, triple-slash reference, empty enum, and `window` rules have no direct built-in Bun
equivalents and are not retained. Deno's type checker still catches invalid globals, unresolved
imports, syntax and type errors, including `await` in synchronous functions; it does not replace
all of those lint policies. Bun's syntax-only type import rule does not fully replace Deno's
`verbatim-module-syntax` export checking. Type-aware rules are intentionally avoided.

Bun recognizes `eslint-disable-next-line` comments using Bun's rule names. Existing intentional
exceptions use `@typescript-eslint/no-non-null-assertion` and `no-control-regex` suppressions.
Both rules remain enabled. Deno-specific ignore validation is gone; Bun validates its own
suppression comments.

Bun's type-aware checks and import-resolution rules are not enabled. `no-undef` is disabled;
Deno checks globals and resolves `deno.json` mappings, `jsr:` specifiers, and URL imports.
Bun parses these imports without executing or resolving them. No extra npm tooling is added;
the existing Deno-managed `npm:oxc-parser` dependency is unchanged.

## Application checks

Run application checks with Deno:

```sh
deno check src/**/*.ts tests/**/*.ts tools/**/*.ts
deno test -A
```

The repository's `.coderail/config` applies Bun lint/fix to TypeScript files.
Source-file test and coverage checks require the corresponding test file;
application test-file test, coverage, and mutation checks require the corresponding
source. Maintainer-tool tests under `tests/tools/` have a separate test rule that
does not require a corresponding application source file.
Type-only modules do not need runtime tests that assert empty exports, or runtime
helpers added solely for coverage. Keep meaningful behavioral tests and follow
the configured checks; do not weaken coverage thresholds to hide failures.

## Existing style violations and CI

This migration intentionally does not reformat existing code. Style checks will report existing
formatting, missing-brace, and other lint violations until those files are fixed. Bun does not
reproduce Deno's case-insensitive named import/export sorting; its optional full import sorting is left off
to avoid reordering import declarations. Use the same Bun build locally and in CI to keep output
consistent. GitHub Actions workflows build and smoke-check stable and canary
release packages. There is no dedicated pull-request workflow running application
tests and style checks.
