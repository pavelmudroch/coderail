---
name: cr-commit
description: Create a clean conventional commit.
disable-model-invocation: true
---

Analyze the currently staged changes and produce an accurate Conventional Commit message.

Use staged changes only:

```sh
git diff --cached
```

You may inspect supporting context when useful:

```sh
git status --short
git diff --cached --stat
git log -5 --oneline
```

Do not stage files, modify source files, amend commits, or push.

If nothing is staged, stop and report that there is nothing to commit.

## Format

```text
type(optional-scope): concise imperative subject
```

Examples:

```text
feat(parser): support repeated array sections
fix(install): preserve executable permissions
refactor(config): extract scalar parsing
docs: document upgrade channels
test(parser): cover malformed arrays
style: normalize shell formatting
chore(ci): add release workflow
```

Mark breaking changes with `!`:

```text
feat(config)!: rename agent configuration keys
```

## Types

Use only:

* `feat` — adds or changes supported functionality
* `fix` — corrects broken or unintended behavior
* `refactor` — changes implementation without intended behavior changes
* `docs` — documentation-only changes
* `test` — test-only changes
* `style` — formatting, whitespace, or other non-behavioral presentation changes
* `chore` — maintenance that does not fit another type

Use scopes for maintenance categories rather than adding more types:

```text
chore(ci): publish tagged releases
chore(build): update compilation flags
chore(deps): update development dependencies
```

Use `refactor` for internal performance improvements unless performance itself is a new supported capability.

Tests and documentation directly related to a feature or fix belong in the same commit:

```text
feat(parser): support tuple values
fix(parser): reject unterminated strings
```

Do not use `test` merely because a feature or fix includes tests.

## Type selection

Choose the type based on the primary purpose of the staged change:

1. Corrects broken behavior → `fix`
2. Adds or changes functionality → `feat`
3. Restructures implementation without intended behavior changes → `refactor`
4. Changes only documentation, tests, or formatting → `docs`, `test`, or `style`
5. Everything else → `chore`

## Scope

The scope is optional.

Use it when it identifies a meaningful command, package, module, or subsystem:

```text
parser
config
install
upgrade
cli
release
ci
build
deps
```

Prefer terminology already used in the repository. Omit vague or redundant scopes such as `core` or `documentation`.

## Subject

The subject must:

* describe only the staged changes
* use imperative wording
* begin lowercase unless a proper name requires capitalization
* omit the final period
* remain concise
* avoid vague wording such as `update code`, `make changes`, or `fix issue`

Prefer:

```text
fix(install): preserve executable permissions
```

Avoid:

```text
fix(install): fixed permission issue.
```

## Commit body

The body is optional.

Add one when the subject alone does not sufficiently explain:

* a larger logical change
* several related modifications
* architectural or workflow consequences
* the reason behind a non-obvious implementation
* compatibility or migration details

Explain what changed and, when useful, why. Do not merely repeat the subject.

```text
feat(install): support multiple agent targets

Allow one command to install shared skills for Codex, Copilot, Claude,
and Gemini while preserving each tool's target-specific layout.
```

Use a second `-m` argument:

```sh
git commit \
  -m 'feat(install): support multiple agent targets' \
  -m 'Allow one command to install shared skills for Codex, Copilot, Claude, and Gemini while preserving each tool'\''s target-specific layout.'
```

The first `-m` creates the subject. The second creates the commit body, displayed by GitHub as the commit description.

Small, self-explanatory commits should remain subject-only:

```sh
git commit -m 'fix(parser): reject empty section names'
```

For complex multiline messages, a heredoc may be clearer:

```sh
git commit -F - <<'EOF'
feat(install): support multiple agent targets

Allow one command to install shared skills for all supported agents.
Preserve each agent's target-specific paths and file formats.
EOF
```

## Breaking changes

Use `!` when a supported interface, command, configuration format, or behavior contract becomes incompatible:

```text
feat(config)!: rename agent configuration keys
```

Add a `BREAKING CHANGE:` footer when migration details are useful:

```text
feat(config)!: rename agent configuration keys

BREAKING CHANGE: Replace agentPaths with agent_paths in existing
configuration files.
```

## Logical commit check

Verify that the staged changes form one logical commit.

A commit may include:

* implementation
* directly related tests
* directly related documentation
* required configuration changes
* small supporting refactors

Warn instead of producing a vague message when staged changes contain unrelated work, such as:

* an unrelated feature and bug fix
* broad formatting mixed with behavior changes
* unrelated dependency upgrades
* multiple independent features
* accidental or generated files unrelated to the change

Describe the logical groups that should be staged separately.

## Output

```text
Summary: <brief description of the staged change>

Commit:
<subject>

<body, only when useful>

Command:
<git commit command>
```

Example:

```text
Summary: Adds support for installing shared skills into multiple agent targets and covers target-specific paths.

Commit:
feat(install): support multiple agent targets

Allow one command to install shared skills for all supported agents
while preserving each tool's target-specific layout.

Command:
git commit \
  -m 'feat(install): support multiple agent targets' \
  -m 'Allow one command to install shared skills for all supported agents while preserving each tool'\''s target-specific layout.'
```
