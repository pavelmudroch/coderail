---
title: "Templates"
status: "archived"
---

## Outcome

Apply reusable project setup from named templates: copy predefined files into
the project, merge Coderail settings, and run a startup script.

## Confirmed decisions

- Scope includes applying templates through `cr init` and template management:
  listing/inspection through `cr template`, `cr template create`, and
  `cr template delete`.
- Listing is alphabetical; named inspection uses exact name matching. JSON
  template entries contain `{ name, description, path }`. `--path` prints
  absolute paths, one per line. An unknown template name reports failure.
- Templates live inside the Coderail installation directory at
  `<installRoot>/templates/<template-name>/`, for example
  `~/.coderail/templates/<template-name>/`. Do not hardcode the example root.
- Store template metadata in the fixed extensionless file `template` inside
  each template directory, regardless of the template's name. Metadata includes
  the description; the directory name identifies the template. Avoid `.conf`
  because VS Code treats that extension as nginx configuration.
- Parse `template` using the same custom config format as Coderail's basic
  configuration. Its only field in this scope is `description`, defaulting to
  an empty string (`description = ""`). Additional metadata is expected later
  but remains out of scope; retain the structured format for that extension.
- `cr template create <name>` creates a new template directory containing an
  empty `assets/` directory, an empty `config` file, and a `template` metadata
  file holding `description = <quoted text>` from `--description`, or
  `description = ""` when none is supplied.
  Do not create a startup script by default. Fail if the template directory
  already exists.
- `cr template delete <name>` prompts for confirmation before removing the
  template directory and its contents, protecting against accidental shell
  history invocation. `--yes` confirms deletion without prompting. The user
  updated delete usage to include this flag; no delete `--no` flag is requested.
- Each template includes an `assets/` directory whose contents are copied into
  the project root, preserving their relative paths.
- A template includes Coderail `config` settings that are merged into the
  project's `.coderail/config`.
- Template config values override matching existing project scalar values;
  nested settings merge recursively, and arrays append template entries after
  existing entries.
- Apply multiple templates sequentially in command-line order, completing
  assets, config, and startup for each before proceeding to the next. Later
  templates override earlier scalar settings and append arrays and comments.
- Deduplicate arrays before stringifying the final merged config, including
  when applying a template again. Deduplicate `verify.rules` (object entries),
  each rule's `requires` entries, and lists of commands. Preserve each command's
  argument array exactly, including repeated arguments; do not recursively
  deduplicate that second directly nested array. This applies to command lists
  in rule `commands` and verification `pre`/`post`.
- Compare rule objects by all field values, ignoring object key order. Keep the
  first occurrence when deduplicating; rules with the same pattern and different
  commands remain separate. Whole-command equality preserves argument order.
- Load each participating config into a separate object, merge those objects,
  then stringify the final merged object and write it to the project config.
  Original formatting need not be preserved.
- Extract comments from each source into a map from the next property key below
  the comment to an array of comment lines. Append comment lines from multiple
  sources for the same key and preserve them when stringifying the merged
  object. Drop comments with no following property key and comments whose next
  key is an array, because the final array index cannot be reliably identified.
- Comment-map keys use full property paths, such as `loop.codex.model`, so
  identically named properties in different namespaces remain distinct. Also
  drop comments inside array elements because merging can change their indexed
  paths.
- Comments before an object section header attach to that section's full path.
  Inline comments attach to their own property and stringify above it. Blank
  lines do not break association with the next property. Array-related comments
  still follow the drop rules above.
- Run the template startup script after both asset copying and config merging
  have completed. The order is assets, config, startup.
- Run startup from the project root. Prefer `startup.sh` on Unix or
  `startup.ps1` on Windows; fall back to `startup.ts` when no matching platform
  script exists. Run only the selected script. If no applicable startup script
  exists, finish after merging config.
- If startup fails, report failure and stop subsequent templates. Keep copied
  files, merged config, and any script changes; do not attempt rollback.
- Asset conflicts stop application and report failure by default.
- Check all assets in each template before copying. A default asset-conflict
  failure leaves that template unapplied. Identical existing files are already
  satisfied and do not conflict. Existing directories merge; file/directory
  mismatches fail even with `--force`.
- `--force` enables prompting the user for permission to overwrite conflicting
  assets; it does not itself authorize overwriting.
- `--yes` and `--no` automatically answer overwrite prompts affirmatively and
  negatively, respectively.
- Declining an overwrite skips that file and continues template application.
  This also applies to automatic declines from `--force --no`.
- `--dry [<path>]` has two modes:
  - Without a path, preview planned asset copies, conflicts, and config changes
    without writing project files, prompting, or executing startup. Startup may
    depend on copied files and merged config, so it must not run in preview mode.
  - With a directory path, perform full initialization into that directory so
    the user can inspect the actual result. Reuse the directory if it exists;
    otherwise try to create it. This includes asset copying, config merging,
    and startup execution with that target directory as the working directory.
- `--dry` consumes its next non-option argument as the optional target directory.
  Put template names before `--dry` for an unambiguous invocation:
  `cr init my-template --dry` previews, while
  `cr init my-template --dry ./preview` initializes `./preview`.
  `cr init --dry my-template` treats `my-template` as a directory, not a template.
- Resolve alternate target paths relative to the effective working directory
  selected by global `--cwd`. Alternate-target initialization follows normal
  conflict and confirmation rules.
- Bare `--dry` reports all conflicts and exits with failure if any exist. It
  never prompts or writes, regardless of force/automatic-answer flags.
- For application, `--yes` and `--no` require `--force` and cannot be combined.
  If a required prompt cannot run interactively, fail with guidance to supply
  an automatic answer. Deletion separately accepts `--yes` without force.

## Current understanding

- `src/commands/template.ts` and its `create` and `delete` subcommand files
  contain usage proposals but placeholder parsing and execution. The parent
  does not route subcommands or handle help yet.
- Existing usage proposes named templates, listing, JSON/path output, creation,
  deletion, and descriptions. The agreed contracts replace these initial
  sketches; implementation must align parsing and help with this design.
- The latest create usage shows a plain-text `description` file. Update that
  help during implementation to show the agreed config-format `template` file.
- `src/commands/init.ts` accepts multiple template names, but installation only
  waits and logs success; it does not apply template files or execute scripts.
- Installation and upgrade infrastructure already accommodates a `templates/`
  resource directory and preserves user-created template files during upgrades.
- No top-level `templates/` directory exists in this checkout.
- Runtime context already exposes `installRoot`; development resource discovery
  separately uses an `assets/` resource root. Template lookup always uses
  `<installRoot>/templates`, including source development, as agreed in DESIGN.md.
- Existing config loading merges later scalar values over earlier values,
  merges loop settings per harness, and appends verification rules and pre/post
  commands. It produces an in-memory configuration, not a rewritten config file;
  template persistence requires stringification and comment extraction support.
- `src/conf/parse.ts` already exposes parsed objects and property source
  locations through `getMeta`, but does not expose comments or a stringifier.
  It distinguishes nested objects, bracket arrays, and object-array sections.
- Existing install/uninstall commands use `--force [--yes | --no]`, reject
  simultaneous yes/no flags, and require force for either automatic answer.
  Template application follows these same flag validation rules.

## Open questions

No consequential product, behavioral, or structural decisions remain open.

## Agreed structure

[DESIGN.md](DESIGN.md) defines agreed module boundaries and public interfaces:
config parsing/comments, document merging/stringification and validation in
`src/conf`; catalog/application/startup in `src/templates` behind a facade;
base initialization in `ProjectInitialization`; CLI behavior in existing
commands. The user reviewed and accepted the structure and interface contract.

## Confirmed runtime behavior

- Require `template`, `config`, and `assets/` as the template layout; empty
  config and assets are valid. Only startup is optional.
- Validate the template and collect force overwrite decisions before copying
  its assets. Declined files are skipped as agreed.
- Invoke startup with `sh`, `pwsh`, or `deno run -A` for the selected script;
  missing interpreters report failure. Keep process invocation details private.
- Any application error stops subsequent templates. Do not roll back earlier
  changes, including partial changes from I/O errors.
## Verification expectations

- Cover default conflict failure, force prompting, automatic yes/no responses,
  and startup execution only after successful asset copying and config merging.
- Verify a default conflict is detected before any assets from that template
  are copied, identical files do not conflict, directories merge, and
  file/directory mismatches fail even with force.
- Verify creation scaffolds assets/config/metadata, persists an optional
  description, does not generate startup, and fails without altering an
  existing template directory.
- Verify metadata uses the existing custom config syntax, defaults description
  to an empty string, and correctly escapes descriptions when creating files.
- Verify deletion prompts before removal, a decline preserves the template,
  and `--yes` removes it without prompting.
- Cover declined overwrites preserving the existing file while allowing the
  remaining assets, config merge, and startup to proceed.
- Verify template config overrides matching scalars, preserves unrelated nested
  settings, merges matching nested settings, and appends array entries in order.
- Verify multiple templates complete sequentially in command-line order and
  later templates override earlier settings; verify array deduplication before
  stringify, including repeated application.
- Verify rule objects, `requires` entries, and command-list entries deduplicate,
  while repeated arguments inside a command remain unchanged.
- Verify rule equality ignores object key order but distinguishes differing
  field values, retains the first occurrence, and preserves distinct rules
  sharing a pattern. Command equality must distinguish argument ordering.
- Verify final merged objects stringify to equivalent config, comments from
  multiple sources append for the same key, and trailing comments and comments
  targeting arrays or inside array elements are dropped. Verify fully qualified
  comment paths distinguish identically named properties in different sections.
- Verify comments before object section headers attach to those sections,
  inline comments reappear above their own property, and intervening blank
  lines do not break association with the next property.
- Verify startup runs with the project root as working directory, selects the
  platform script ahead of TypeScript, falls back to TypeScript, runs only one
  script, and allows templates with no applicable startup script.
- Cover `--dry` previews of copies, conflicts, and config changes, absence of
  project writes and prompts, and no startup execution even when the script
  would fail without the copied assets. Assert failure status for reported
  conflicts even when force or automatic-answer flags are present.
- Cover `--dry <path>` reusing an existing target directory, creating a missing
  target directory, and initializing that target for inspection, including
  startup execution with the target as its working directory.
- Verify optional dry-path parsing, including template names before `--dry`,
  a following positional argument consumed as the directory, and a following
  option leaving dry mode without a path.
- Cover startup failures preserving applied changes, reporting failure, and
  preventing subsequent templates from running.
- Verify alphabetical/exact-name lookup, absolute path output, consistent JSON
  arrays, mutually exclusive output flags, empty listing for absent template
  storage, and failure on unknown names.
- Verify template layout/config validation and overwrite decisions happen
  before that template's copying, missing interpreters report failure, and
  noninteractive operations fail when a required automatic answer is absent.
- Verify preview tracks planned changes between templates without executing
  startup; do not claim to predict arbitrary script effects.
- Verify existing parser callers, runtime config loading, and doctor callers
  retain their existing behavior.
- During implementation, run `cr verify` for every modified source or test file
  as required by AGENTS.md.

## Readiness assessment

Outcome, CLI behavior, layout, merge/comment/deduplication semantics, startup,
failure handling, module ownership, public interfaces, and verification
expectations have been reviewed. Keep one idea: management and application
share the same template format and catalog; no separate product decisions
require decomposition. No implementation tickets are generated here.

Private helper organization, efficient equality/copy algorithms, deterministic
formatting details, error wording, and test fixture organization remain with
implementation. Implement path handling within the agreed installation and
target boundaries using existing repository conventions.

Accepted limits: config formatting changes, specified comments are dropped,
script effects are excluded from preview, and application failures do not roll
back completed work. Additional metadata fields remain outside this scope.
