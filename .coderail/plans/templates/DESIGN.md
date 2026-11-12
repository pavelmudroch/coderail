# Agreed module boundaries and interfaces

Status: agreed. Behavioral decisions live in IDEA.md.

## Config documents

Extend the existing `src/conf/parse.ts` parser to collect comments alongside
its existing values and source locations. Keep `toObject()` and `getMeta()`
compatible. Add `getComments()` returning an independent comment map keyed by
full property paths; callers cannot mutate parser state through that map.

Add `src/conf/merge.ts` and `src/conf/stringify.ts`, exported through the
existing `Conf` facade in `src/conf.ts`:

```ts
type CommentMap = Map<string, string[]>;
type ConfigDocument = { values: ParseResult; comments: CommentMap };

// New ParsedConf method; existing methods remain.
getComments(): CommentMap;

Conf.merge(sources: readonly ConfigDocument[]): ConfigDocument;
Conf.stringify(document: ConfigDocument): string;
```

Merge takes independently parsed source objects, does not mutate them, follows
the agreed override/append/comment rules, and deduplicates before serialization.
Deduplicate requires and command lists before comparing whole rule objects, so
equivalent normalized rules also deduplicate. Preserve all command arguments.
Stringify emits the existing custom syntax, escaping strings correctly and
converting keys consistently with the parser's snake_case/camelCase convention.
Metadata uses the same parse/stringify facilities, with its own description
schema; it is not validated as project configuration.

Reuse existing project config validation for template config rather than
creating a second settings schema. Extract validation from
`src/conf/load-configuration.ts` to `src/conf/validate-configuration.ts` and
expose `Conf.validateConfiguration(parsed: ParsedConf): Partial<Configuration>`.
Validation throws on invalid settings and does not apply runtime defaults.
Keep runtime global/local/environment/CLI merge behavior as it is; the new
document merge is for persistent template application.

## Template storage and application

Add a `Templates` facade in `src/templates.ts`, following the repository's
existing facade convention. Ownership underneath it:

- `src/templates/catalog.ts`: names, paths, metadata, layout validation,
  listing, scaffolding, and removal.
- `src/templates/apply.ts`: per-template preflight, asset copying, config
  persistence, sequential application, and read-only preview.
- `src/templates/startup.ts`: script selection and child process lifecycle.

The facade exposes the following operations:

```ts
type TemplateInfo = { name: string; description: string; path: string };

Templates.list(installRoot: string, signal: AbortSignal): Promise<TemplateInfo[]>;
Templates.get(installRoot: string, name: string, signal: AbortSignal): Promise<TemplateInfo>;
Templates.create(installRoot: string, name: string, description: string,
                 signal: AbortSignal): Promise<TemplateInfo>;
Templates.delete(installRoot: string, name: string, signal: AbortSignal): Promise<TemplateInfo>;

type ApplyOptions = {
    installRoot: string;
    projectRoot: string;
    names: readonly string[];
    mode: 'preview' | 'apply';
    overwrite: 'error' | ((path: string) => Promise<boolean>);
    signal: AbortSignal;
};

type TemplateAction = {
    kind: 'copy' | 'merge-config' | 'startup' | 'skip' | 'conflict';
    path: string;
    details?: string;
};
type TemplateReport = { actions: TemplateAction[]; conflicts: string[] };

Templates.apply(options: ApplyOptions): Promise<TemplateReport>;
```

Catalog operations never prompt. Commands confirm deletion before calling
`Templates.delete`. Application receives overwrite behavior from the command:
error by default, a prompt callback for force, constant true/false callbacks
for automatic answers. Preview never invokes the callback or runs startup.

Catalog names identify one directory directly beneath `<installRoot>/templates`;
reject empty names, traversal, absolute paths, and path separators. Source
development uses the same installation-relative location; no second template
search path or fallback. Detailed filename portability rules remain routine.

Application validates layout and settings before copying each template and
collects overwrite answers before that template's writes. Any actual apply
failure throws with useful context, stops later templates, and preserves prior
changes. Preview returns all known conflicts for CLI reporting and failure
status. Cancelled operations stop child processes and subsequent work using
the existing AbortSignal conventions. Startup uses inherited output streams
so users see script output directly.

Preview tracks planned asset/config changes between sequential templates
without writing them. It describes known effects only; startup scripts are not
executed, so their arbitrary effects on later templates cannot be predicted.
Private report formatting and process helpers remain implementation choices.

## Initialization and CLI integration

Extend the existing `ProjectInitialization` object in
`src/project-initialization.ts` with:

```ts
ProjectInitialization.initialize(options: ApplyOptions): Promise<TemplateReport>;
```

This owns base `.coderail` creation/config/ignore initialization and delegates
named templates to `Templates.apply`. In preview it performs no writes,
including no base initialization. Existing `ensureConfig` and
`ensureIgnoreRules` remain compatible for doctor callers.

Update existing commands rather than creating parallel CLI entry points:

- `src/commands/init.ts`: parse flags, resolve the effective target directory,
  select preview/apply, supply overwrite decisions, invoke initialize, and
  render results. Normal initialization targets the effective working directory,
  preserving the existing init behavior; an alternate dry path replaces it.
- `src/commands/template.ts`: list/inspect, dispatch create/delete, handle
  reserved names after `--`, and render normal/JSON/path output.
- `src/commands/template/create.ts`: parse create options and delegate creation.
- `src/commands/template/delete.ts`: parse delete options, confirm, and delegate
  removal; a declined deletion is a successful no-op with no JSON/path record.

For consistent machine output, JSON results are arrays of TemplateInfo entries
for listing, inspection, creation, and deletion. Paths are absolute; delete
reports the removed directory's former path. `--json` and `--path` are mutually
exclusive. An absent templates directory lists as empty; unknown names fail.

Tests mirror the affected modules and cover the scenarios in IDEA.md. No
implementation tickets or source changes are part of this exploration.
