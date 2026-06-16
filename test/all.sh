#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

some_tests_failed=false
test_files=$(find "$SCRIPT_DIR" -type f -name '*.test.sh')
for test_file in $test_files; do
    echo "Running $test_file"
    echo "-----------------------------"
    sh "$test_file"

    if [ $? -ne 0 ]; then
        echo "---------- FAILED -----------\n"
        some_tests_failed=true
    else
        echo "---------- PASSED -----------\n"
    fi
done

if [ "$some_tests_failed" = true ]; then
    exit 1
fi