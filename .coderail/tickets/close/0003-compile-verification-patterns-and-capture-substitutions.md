---
title: Compile verification patterns and capture substitutions
status: closed
depends-on: 
reason: done
duplicate-of: 
---

# Compile verification patterns and capture substitutions

Compile configured verification rules once and validate every pattern and capture reference before checks run.

## Tasks

1. [x] Cover bounded pattern grammar and substitutions
2. [x] Implement rule compilation and expansion

## Task details

### 1. Cover bounded pattern grammar and substitutions

Scope: add `tests/commands/verify/compile-rules.test.ts`.

Expected outcome:

- Cover anchored, case-sensitive full-path matching, dotfiles, `*`, `**`, Unicode-code-point `?`, and zero-directory `**/` segments.
- Cover named captures, zero-directory `${path:**}/` with an empty capture, the scaffold `src/${path:**}/${file:*}.ts`, and greedy left-to-right capture resolution with backtracking.
- Cover literal regex punctuation, brackets, ordinary braces, parentheses, and backslashes; no extended glob or escape syntax.
- Reject malformed/nested captures, invalid or duplicate names, and undefined command/dependency references, including in unmatched rules.
- Cover one-pass replacement, captured reference-like text, argument boundaries, multiple rules in configuration order, empty command lists, and empty argument arrays.

Validation: assertions check expanded argument arrays and required paths as well as errors containing rule index and offending pattern/reference.

### 2. Implement rule compilation and expansion

Scope: create `src/commands/verify/compile-rules.ts` with `ExpandedRule`, `CompiledRule`, and `compileRules` contracts from the design; reuse `Configuration['verify']`.

Expected outcome:

- Scan the bounded grammar into anchored regular expressions and capture metadata, escaping all literal regex characters; use no broader glob library.
- Accept unique capture names matching `[A-Za-z_][A-Za-z0-9_]*`; preserve the design's separator and zero-directory capture semantics.
- Compile all rules once, in configuration order, and validate every reference before execution.
- Replace `${name}` once per command argument/required path without recursive expansion, argument splitting, shell execution, or environment expansion. Ignore empty command arrays before execution.
- Keep helpers private and expose contracts from their owning module without a separate types module or import alias.

Validation: run `cr test ./src/commands/verify/compile-rules.ts` and `cr test ./tests/commands/verify/compile-rules.test.ts`.

## References

- [Design: rule compilation contract](../../plans/verify-command/DESIGN.md#rule-compilation-contract)
- [Existing configuration type](../../../src/conf/configuration.ts)
- [Verify decisions](../../plans/verify-command/IDEA.md)
