#!/usr/bin/env sh

set -e

sourceFile="${1-""}"
testFile="${2-""}"

if [ -z "$sourceFile" ]; then
    printf 'Missing source file %s\n' "$sourceFile" >&2
    exit 1
fi

if [ ! -f "$sourceFile" ]; then
    printf 'Source file does not exist: %s\n' "$sourceFile" >&2
    exit 1
fi

deno lint --fix "$sourceFile"
deno fmt "$sourceFile"

if [ -z "$testFile" ] || [ ! -f "$testFile" ]; then
    exit 0
fi

deno test --coverage --coverage-raw-data-only "$testFile"
deno coverage --detailed
rm -rf ./coverage
deno run -A ./tools/mutate.ts "$sourceFile" "$testFile"