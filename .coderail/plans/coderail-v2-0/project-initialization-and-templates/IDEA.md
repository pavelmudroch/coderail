---
title: Project initialization and templates
status: forging
---

## Desired Outcome

Users can initialize a repository with no template, one template, or multiple templates to automatically prepare their chosen project setup.

## Understanding

* Inherits shared decisions and constraints from [Coderail v2.0](../IDEA.md).
* Core `init` is almost done. This child focuses on completing initialization with optional templates, preserving existing behavior unless a template-related change requires adjustment.
* Users prepare reusable templates containing directory structures and base configuration files, for example for Deno, Bun, or Zig projects.
* Templates may include startup scripts, such as scripts that install dependencies during initialization.
* Multiple templates can be selected for one initialization; templates remain optional.
* Covers template selection, application, composition, and startup-script execution. User-level harness installation belongs to `install` and `uninstall`.
* Current CLI help already describes `cr init [<template> ...]` and templates under the Coderail installation's `templates/` directory. Detailed behavior remains to be forged.

## Open Questions

* What defines a template, and how do users create, store, and select their templates?
* In what order are multiple templates applied, and how are overlapping paths or existing project files handled?
* When and how are startup scripts executed relative to applying template files and other templates?
* What happens when template application or a startup script fails, and how can initialization be resumed or repeated?
