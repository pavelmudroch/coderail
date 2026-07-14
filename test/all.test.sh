#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/.."
    pwd
)

TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-all-runner-test.XXXXXX")

. "$ROOT_DIR/test/suite.sh"

cleanup() {
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

run_all_test_runner() {
    runner_dir=$1
    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    sh "$runner_dir/all.sh" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_failure() {
    [ "$run_status" -ne 0 ] || fail "expected failure"
}

assert_file_empty() {
    [ ! -s "$1" ] || fail "$1 should be empty"
}

assert_all_runner_preserves_spaces_and_failure_status() {
    runner_dir="$tmp_dir/repo with spaces/test"

    mkdir -p "$runner_dir/cases with spaces"
    cp "$ROOT_DIR/test/all.sh" "$runner_dir/all.sh"
    printf '%s\n' '#!/usr/bin/env sh' 'exit 0' > "$runner_dir/cases with spaces/pass file.test.sh"
    printf '%s\n' '#!/usr/bin/env sh' 'exit 1' > "$runner_dir/cases with spaces/fail file.test.sh"

    run_all_test_runner "$runner_dir"

    assert_failure
    assert_file_empty "$run_stderr"
}

print_tests_header "All Runner Tests"
test "All runner preserves spaces and failure status" assert_all_runner_preserves_spaces_and_failure_status

print_tests_summary

if some_tests_failed; then
    exit 1
fi
