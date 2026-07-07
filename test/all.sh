#!/usr/bin/env sh

set -u
set +e

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

some_tests_failed=false
test_files=$(find "$SCRIPT_DIR" -type f -name '*.test.sh')
for test_file in $test_files; do
    sh "$test_file"
    echo ""

    if [ $? -ne 0 ]; then
        some_tests_failed=true
    fi
done

if [ "$some_tests_failed" = true ]; then
    exit 1
fi