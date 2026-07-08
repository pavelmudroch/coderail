#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../.."
    pwd
)

CR=$ROOT_DIR/bin/cr
TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-test-command-test.XXXXXX")

. "$ROOT_DIR/test/suite.sh"

cleanup() {
    chmod -R u+rwX "$tmp_dir" 2>/dev/null || :
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

create_work_dir() {
    case_name=$1
    work_dir=$tmp_dir/$case_name

    mkdir -p "$work_dir/.coderail"
    printf '%s\n' "$work_dir"
}

create_path() {
    path=$1

    mkdir -p "$(dirname "$path")"
    : > "$path"
}

write_test_map() {
    work_dir=$1

    cat > "$work_dir/.coderail/test.map"
}

run_cr_test() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" test "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_cr_verbose_test() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" --verbose test "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_success() {
    [ "$run_status" -eq 0 ] || fail "expected success, got status $run_status"
}

assert_failure() {
    [ "$run_status" -ne 0 ] || fail "expected failure"
}

assert_file() {
    [ -f "$1" ] || fail "missing file: $1"
}

assert_path_missing() {
    [ ! -e "$1" ] || fail "path should not exist: $1"
}

assert_file_empty() {
    [ ! -s "$1" ] || fail "$1 should be empty"
}

assert_contains() {
    grep -F "$2" "$1" >/dev/null || fail "$1 does not contain: $2"
}

assert_file_content() {
    file=$1
    expected=$2
    expected_file=$tmp_dir/expected-content

    assert_file "$file"
    printf '%s\n' "$expected" > "$expected_file"
    cmp "$expected_file" "$file" >/dev/null || fail "$file content differs"
}

assert_stdout_content() {
    assert_file_content "$run_stdout" "$1"
}

assert_stderr_contains() {
    assert_contains "$run_stderr" "$1"
}

assert_missing_test_map_fails() {
    work_dir=$tmp_dir/missing-map

    mkdir "$work_dir"
    create_path "$work_dir/README.md"

    run_cr_test "$work_dir" README.md

    assert_failure
    assert_file_empty "$run_stdout"
    assert_stderr_contains "error: missing .coderail/test.map"
}

assert_unreadable_test_map_fails() {
    work_dir=$(create_work_dir unreadable-map)

    create_path "$work_dir/README.md"
    printf '[default]\ntrue\n' > "$work_dir/.coderail/test.map"
    chmod 000 "$work_dir/.coderail/test.map"

    run_cr_test "$work_dir" README.md

    chmod u+rw "$work_dir/.coderail/test.map"

    assert_failure
    assert_file_empty "$run_stdout"
    assert_stderr_contains "error: unreadable .coderail/test.map"
}

assert_invalid_test_maps_fail() {
    work_dir=$(create_work_dir invalid-command-before-section)
    create_path "$work_dir/README.md"
    printf 'printf hi\n' > "$work_dir/.coderail/test.map"
    run_cr_test "$work_dir" README.md
    assert_failure
    assert_file_empty "$run_stdout"
    assert_stderr_contains "error: invalid .coderail/test.map"

    work_dir=$(create_work_dir invalid-malformed-section)
    create_path "$work_dir/README.md"
    printf '[src/*.sh\ntrue\n' > "$work_dir/.coderail/test.map"
    run_cr_test "$work_dir" README.md
    assert_failure
    assert_file_empty "$run_stdout"
    assert_stderr_contains "error: invalid .coderail/test.map"

    work_dir=$(create_work_dir invalid-empty-section)
    create_path "$work_dir/README.md"
    printf '[]\ntrue\n' > "$work_dir/.coderail/test.map"
    run_cr_test "$work_dir" README.md
    assert_failure
    assert_file_empty "$run_stdout"
    assert_stderr_contains "error: invalid .coderail/test.map"

    work_dir=$(create_work_dir invalid-binary-content)
    create_path "$work_dir/README.md"
    printf '[default]\ntrue\000\n' > "$work_dir/.coderail/test.map"
    run_cr_test "$work_dir" README.md
    assert_failure
    assert_file_empty "$run_stdout"
    assert_stderr_contains "error: invalid .coderail/test.map"
}

assert_empty_map_reports_no_tests() {
    work_dir=$(create_work_dir empty-map)

    create_path "$work_dir/README.md"
    : > "$work_dir/.coderail/test.map"

    run_cr_test "$work_dir" README.md

    assert_success
    assert_stdout_content "README.md: no tests found"
    assert_file_empty "$run_stderr"
    assert_path_missing "$work_dir/run.log"
}

assert_no_matching_glob_reports_no_tests() {
    work_dir=$(create_work_dir no-match)

    create_path "$work_dir/README.md"
    write_test_map "$work_dir" <<'EOF'
[lib/**/*.sh]
printf 'lib\n' >> run.log
EOF

    run_cr_test "$work_dir" README.md

    assert_success
    assert_stdout_content "README.md: no tests found"
    assert_file_empty "$run_stderr"
    assert_path_missing "$work_dir/run.log"
}

assert_default_commands_run() {
    work_dir=$(create_work_dir default-only)

    create_path "$work_dir/README.md"
    write_test_map "$work_dir" <<'EOF'
[default]
printf 'default\n' >> run.log
EOF

    run_cr_test "$work_dir" README.md

    assert_success
    assert_stdout_content "README.md: passed"
    assert_file_content "$work_dir/run.log" "default"
}

assert_glob_commands_run_without_default() {
    work_dir=$(create_work_dir glob-only)

    create_path "$work_dir/lib/test.sh"
    write_test_map "$work_dir" <<'EOF'
[lib/*.sh]
printf 'glob\n' >> run.log
EOF

    run_cr_test "$work_dir" lib/test.sh

    assert_success
    assert_stdout_content "lib/test.sh: passed"
    assert_file_content "$work_dir/run.log" "glob"
}

assert_default_and_glob_run_in_map_order() {
    work_dir=$(create_work_dir default-and-glob)

    create_path "$work_dir/src/app.sh"
    write_test_map "$work_dir" <<'EOF'
[default]
printf 'default\n' >> run.log

[src/*.sh]
printf 'glob\n' >> run.log
EOF

    run_cr_test "$work_dir" src/app.sh

    assert_success
    assert_stdout_content "src/app.sh: passed"
    assert_file_content "$work_dir/run.log" "default
glob"
}

assert_path_globs_match_expected_paths() {
    work_dir=$(create_work_dir path-globs)

    create_path "$work_dir/README.md"
    create_path "$work_dir/lib/root.sh"
    create_path "$work_dir/lib/commands/test.sh"
    write_test_map "$work_dir" <<'EOF'
[README.md]
printf 'exact %s\n' {path} >> run.log

[*.md]
printf 'root-md %s\n' {path} >> run.log

[lib/*.sh]
printf 'single %s\n' {path} >> run.log

[lib/**/*.sh]
printf 'recursive %s\n' {path} >> run.log

[**/*.sh]
printf 'all-sh %s\n' {path} >> run.log
EOF

    run_cr_test "$work_dir" README.md lib/root.sh lib/commands/test.sh

    assert_success
    assert_stdout_content "README.md: passed
lib/root.sh: passed
lib/commands/test.sh: passed"
    assert_file_content "$work_dir/run.log" "exact README.md
root-md README.md
single lib/root.sh
recursive lib/root.sh
recursive lib/commands/test.sh
all-sh lib/root.sh
all-sh lib/commands/test.sh"
}

assert_duplicate_commands_run_once() {
    work_dir=$(create_work_dir duplicate-commands)

    create_path "$work_dir/lib/a.sh"
    write_test_map "$work_dir" <<'EOF'
[default]
printf 'same\n' >> run.log
printf 'same\n' >> run.log

[lib/**/*.sh]
printf 'same\n' >> run.log
printf 'specific\n' >> run.log
EOF

    run_cr_test "$work_dir" lib/a.sh

    assert_success
    assert_stdout_content "lib/a.sh: passed"
    assert_file_content "$work_dir/run.log" "same
specific"
}

assert_static_duplicate_across_files_runs_once() {
    work_dir=$(create_work_dir duplicate-across-files)

    create_path "$work_dir/src/a.sh"
    create_path "$work_dir/src/b.sh"
    write_test_map "$work_dir" <<'EOF'
[default]
printf 'repo\n' >> run.log
printf 'path %s\n' {path} >> run.log
EOF

    run_cr_test "$work_dir" src/a.sh src/b.sh

    assert_success
    assert_stdout_content "src/a.sh: passed
src/b.sh: passed"
    assert_file_content "$work_dir/run.log" "repo
path src/a.sh
path src/b.sh"
}

assert_path_placeholder_quotes_spaces() {
    work_dir=$(create_work_dir path-with-spaces)

    create_path "$work_dir/docs/my file.md"
    write_test_map "$work_dir" <<'EOF'
[docs/**/*.md]
printf '<%s>\n' {path} >> run.log
EOF

    run_cr_test "$work_dir" "docs/my file.md"

    assert_success
    assert_stdout_content "docs/my file.md: passed"
    assert_file_content "$work_dir/run.log" "<docs/my file.md>"
}

assert_failures_do_not_stop_result_collection() {
    work_dir=$(create_work_dir collect-failures)

    create_path "$work_dir/src/fail.sh"
    create_path "$work_dir/src/pass.sh"
    create_path "$work_dir/README.md"
    write_test_map "$work_dir" <<'EOF'
[src/fail.sh]
false
printf 'after-fail\n' >> run.log

[src/pass.sh]
printf 'pass\n' >> run.log
EOF

    run_cr_test "$work_dir" src/fail.sh src/pass.sh README.md

    assert_failure
    assert_stdout_content "src/fail.sh: failed
src/pass.sh: passed
README.md: no tests found"
    assert_file_content "$work_dir/run.log" "after-fail
pass"
}

assert_shared_static_failure_marks_all_files_failed() {
    work_dir=$(create_work_dir shared-static-failure)

    create_path "$work_dir/src/a.sh"
    create_path "$work_dir/README.md"
    write_test_map "$work_dir" <<'EOF'
[default]
false
EOF

    run_cr_test "$work_dir" src/a.sh README.md

    assert_failure
    assert_stdout_content "src/a.sh: failed
README.md: failed"
}

assert_verbose_failure_prints_failed_command_output() {
    work_dir=$(create_work_dir verbose-failure-output)

    create_path "$work_dir/src/fail.sh"
    create_path "$work_dir/src/pass.sh"
    write_test_map "$work_dir" <<'EOF'
[src/*.sh]
case {path} in *fail.sh) printf 'failed stdout\n'; printf 'failed stderr\n' >&2; exit 7;; esac
EOF

    run_cr_test "$work_dir" src/fail.sh src/pass.sh

    assert_failure
    assert_stdout_content "src/fail.sh: failed
src/pass.sh: passed"
    assert_file_empty "$run_stderr"

    run_cr_verbose_test "$work_dir" src/fail.sh src/pass.sh

    assert_failure
    assert_contains "$run_stdout" "failed command output:"
    assert_contains "$run_stdout" "failed stdout"
    assert_contains "$run_stdout" "failed stderr"
    assert_contains "$run_stdout" "src/fail.sh: failed"
    assert_contains "$run_stdout" "src/pass.sh: passed"
    assert_file_empty "$run_stderr"
}

assert_absolute_paths_fail() {
    work_dir=$(create_work_dir absolute-path)

    create_path "$work_dir/README.md"
    write_test_map "$work_dir" <<'EOF'
[default]
true
EOF

    run_cr_test "$work_dir" "$work_dir/README.md"

    assert_failure
    assert_file_empty "$run_stdout"
    assert_stderr_contains "error: absolute paths are not supported"
}

print_tests_header "Test Command Tests"
test "Missing test map fails" assert_missing_test_map_fails
test "Unreadable test map fails" assert_unreadable_test_map_fails
test "Invalid test maps fail" assert_invalid_test_maps_fail
test "Empty map reports no tests" assert_empty_map_reports_no_tests
test "No matching glob reports no tests" assert_no_matching_glob_reports_no_tests
test "Default commands run" assert_default_commands_run
test "Glob commands run without default" assert_glob_commands_run_without_default
test "Default and glob run in map order" assert_default_and_glob_run_in_map_order
test "Path globs match expected paths" assert_path_globs_match_expected_paths
test "Duplicate commands run once" assert_duplicate_commands_run_once
test "Static duplicate across files runs once" assert_static_duplicate_across_files_runs_once
test "Path placeholder quotes spaces" assert_path_placeholder_quotes_spaces
test "Failures do not stop result collection" assert_failures_do_not_stop_result_collection
test "Shared static failure marks all files failed" assert_shared_static_failure_marks_all_files_failed
test "Verbose failure prints failed command output" assert_verbose_failure_prints_failed_command_output
test "Absolute paths fail" assert_absolute_paths_fail

print_tests_summary

if some_tests_failed; then
    exit 1
fi
