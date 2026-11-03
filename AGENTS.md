When you implement or modify files in `./src` or `./tests`, run the appropriate
verification after completing those modifications. If verification fails, fix
the problems and repeat until it passes.

Do not run verification solely because existing changes are staged or because
you are reviewing or committing them.

1. For a modified file in `./src`, run `cr verify ./src/<path-to-file>.ts`.
2. For a modified file in `./tests`, run `cr verify ./tests/<path-to-file>.test.ts`.