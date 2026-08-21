#!/usr/bin/env sh

set -u
set +e

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

some_tests_failed=0
TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-all-test.XXXXXX")
test_files=$tmp_dir/test-files

cleanup() {
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

find "$SCRIPT_DIR" -type f -name '*.test.sh' | sort > "$test_files"

while IFS= read -r test_file || [ -n "$test_file" ]; do
    sh "$test_file"
    test_status=$?
    echo ""

    if [ "$test_status" -ne 0 ]; then
        some_tests_failed=1
    fi
done < "$test_files"

if [ "$some_tests_failed" -ne 0 ]; then
    exit 1
fi
