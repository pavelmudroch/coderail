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

    work_dir=$(create_work_dir invalid-capture-missing-name)
    create_path "$work_dir/src/app.sh"
    printf '[src/{:*.sh}]\ntrue\n' > "$work_dir/.coderail/test.map"
    run_cr_test "$work_dir" src/app.sh
    assert_failure
    assert_file_empty "$run_stdout"
    assert_stderr_contains "error: invalid .coderail/test.map"

    work_dir=$(create_work_dir invalid-capture-missing-colon)
    create_path "$work_dir/src/app.sh"
    printf '[src/{name}.sh]\ntrue\n' > "$work_dir/.coderail/test.map"
    run_cr_test "$work_dir" src/app.sh
    assert_failure
    assert_file_empty "$run_stdout"
    assert_stderr_contains "error: invalid .coderail/test.map"

    work_dir=$(create_work_dir invalid-capture-missing-glob)
    create_path "$work_dir/src/app.sh"
    printf '[src/{name:}.sh]\ntrue\n' > "$work_dir/.coderail/test.map"
    run_cr_test "$work_dir" src/app.sh
    assert_failure
    assert_file_empty "$run_stdout"
    assert_stderr_contains "error: invalid .coderail/test.map"

    work_dir=$(create_work_dir invalid-capture-missing-close)
    create_path "$work_dir/src/app.sh"
    printf '[src/{name:*.sh]\ntrue\n' > "$work_dir/.coderail/test.map"
    run_cr_test "$work_dir" src/app.sh
    assert_failure
    assert_file_empty "$run_stdout"
    assert_stderr_contains "error: invalid .coderail/test.map"

    work_dir=$(create_work_dir invalid-capture-name)
    create_path "$work_dir/src/app.sh"
    printf '[src/{1name:*}.sh]\ntrue\n' > "$work_dir/.coderail/test.map"
    run_cr_test "$work_dir" src/app.sh
    assert_failure
    assert_file_empty "$run_stdout"
    assert_stderr_contains "error: invalid .coderail/test.map"

    work_dir=$(create_work_dir invalid-unescaped-close-brace)
    create_path "$work_dir/src/app}.sh"
    printf '[src/app}.sh]\ntrue\n' > "$work_dir/.coderail/test.map"
    run_cr_test "$work_dir" 'src/app}.sh'
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

assert_changed_omits_coderail_files() {
    work_dir=$(create_work_dir changed-omits-coderail)

    create_path "$work_dir/src/app.sh"
    create_path "$work_dir/.coderail/local.txt"
    write_test_map "$work_dir" <<'EOF'
[{path:**}]
printf '%s\n' {path} >> run.log
EOF

    git -C "$work_dir" init >/dev/null 2>&1

    run_cr_test "$work_dir" --changed

    assert_success
    assert_stdout_content "src/app.sh: passed"
    assert_file_content "$work_dir/run.log" "src/app.sh"
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
[{path:README.md}]
printf 'exact %s\n' {path} >> run.log

[{path:*.md}]
printf 'root-md %s\n' {path} >> run.log

[{path:lib/*.sh}]
printf 'single %s\n' {path} >> run.log

[{path:lib/**/*.sh}]
printf 'recursive %s\n' {path} >> run.log

[{path:**/*.sh}]
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

assert_path_capture_commands_run() {
    work_dir=$(create_work_dir path-capture)

    create_path "$work_dir/src/app.sh"
    write_test_map "$work_dir" <<'EOF'
[{path:src/*.sh}]
printf 'path %s\n' {path} >> run.log
EOF

    run_cr_test "$work_dir" src/app.sh

    assert_success
    assert_stdout_content "src/app.sh: passed"
    assert_file_content "$work_dir/run.log" "path src/app.sh"
}

assert_nested_capture_maps_source_to_test() {
    work_dir=$(create_work_dir nested-capture)

    create_path "$work_dir/lib/commands/install.sh"
    mkdir -p "$work_dir/test/commands"
    printf "printf 'mapped install\n' >> run.log\n" > "$work_dir/test/commands/install.test.sh"
    write_test_map "$work_dir" <<'EOF'
[lib/{rel:**}/{base:*}.sh]
sh test/{rel}/{base}.test.sh
EOF

    run_cr_test "$work_dir" lib/commands/install.sh

    assert_success
    assert_stdout_content "lib/commands/install.sh: passed"
    assert_file_content "$work_dir/run.log" "mapped install"
}

assert_missing_mapped_test_file_fails() {
    work_dir=$(create_work_dir missing-mapped-test)

    create_path "$work_dir/lib/commands/missing.sh"
    write_test_map "$work_dir" <<'EOF'
[lib/{rel:**}/{base:*}.sh]
sh test/{rel}/{base}.test.sh
EOF

    run_cr_test "$work_dir" lib/commands/missing.sh

    assert_failure
    assert_stdout_content "lib/commands/missing.sh: failed"
    assert_file_empty "$run_stderr"
}

assert_default_path_placeholder_stays_literal() {
    work_dir=$(create_work_dir default-path-literal)

    create_path "$work_dir/src/app.sh"
    write_test_map "$work_dir" <<'EOF'
[default]
printf '%s\n' {path} >> run.log
EOF

    run_cr_test "$work_dir" src/app.sh

    assert_success
    assert_stdout_content "src/app.sh: passed"
    assert_file_content "$work_dir/run.log" "{path}"
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

[{path:src/*.sh}]
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
[{path:docs/**/*.md}]
printf '<%s>\n' {path} >> run.log
EOF

    run_cr_test "$work_dir" "docs/my file.md"

    assert_success
    assert_stdout_content "docs/my file.md: passed"
    assert_file_content "$work_dir/run.log" "<docs/my file.md>"
}

assert_capture_placeholders_render() {
    work_dir=$(create_work_dir capture-placeholders)

    create_path "$work_dir/some relative/path/file name.ext"
    write_test_map "$work_dir" <<'EOF'
[some relative/{dir:**}/{name:*}.{ext:*}]
printf 'dir=<%s> name=<%s> ext=<%s>\n' {dir} {name} {ext} >> run.log
EOF

    run_cr_test "$work_dir" "./some relative/path/file name.ext"

    assert_success
    assert_stdout_content "some relative/path/file name.ext: passed"
    assert_file_content "$work_dir/run.log" "dir=<path> name=<file name> ext=<ext>"
}

assert_duplicate_capture_names_fail() {
    work_dir=$(create_work_dir duplicate-capture-name)

    create_path "$work_dir/src/one/two.sh"
    write_test_map "$work_dir" <<'EOF'
[src/{name:*}/{name:*}.sh]
true
EOF

    run_cr_test "$work_dir" src/one/two.sh

    assert_failure
    assert_file_empty "$run_stdout"
    assert_stderr_contains "error: invalid .coderail/test.map"
}

assert_capture_names_can_repeat_across_sections() {
    work_dir=$(create_work_dir repeated-captures-across-sections)

    create_path "$work_dir/src/app.sh"
    write_test_map "$work_dir" <<'EOF'
[src/{name:*}.sh]
printf 'src %s\n' {name} >> run.log

[test/{name:*}.test.sh]
printf 'test %s\n' {name} >> run.log
EOF

    run_cr_test "$work_dir" src/app.sh

    assert_success
    assert_stdout_content "src/app.sh: passed"
    assert_file_content "$work_dir/run.log" "src app"
}

assert_escaped_pattern_characters_match_literals() {
    work_dir=$(create_work_dir escaped-pattern-characters)

    create_path "$work_dir/src/{literal}.sh"
    create_path "$work_dir/src/name:part.sh"
    create_path "$work_dir/src/cap:name.sh"
    create_path "$work_dir/src/back\\slash.sh"
    write_test_map "$work_dir" <<'EOF'
[src/\{literal\}.sh]
printf 'braces\n' >> run.log

[src/name:part.sh]
printf 'colon\n' >> run.log

[src/{name:cap:name}.sh]
printf 'capture-colon %s\n' {name} >> run.log

[src/back\\slash.sh]
printf 'backslash\n' >> run.log
EOF

    run_cr_test "$work_dir" \
        'src/{literal}.sh' \
        'src/name:part.sh' \
        'src/cap:name.sh' \
        "src/back\\slash.sh"

    assert_success
    assert_stdout_content "src/{literal}.sh: passed
src/name:part.sh: passed
src/cap:name.sh: passed
src/back\\slash.sh: passed"
    assert_file_content "$work_dir/run.log" "braces
colon
capture-colon cap:name
backslash"
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
[{path:src/*.sh}]
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
test "Changed omits coderail files" assert_changed_omits_coderail_files
test "Default commands run" assert_default_commands_run
test "Glob commands run without default" assert_glob_commands_run_without_default
test "Default and glob run in map order" assert_default_and_glob_run_in_map_order
test "Path globs match expected paths" assert_path_globs_match_expected_paths
test "Path capture commands run" assert_path_capture_commands_run
test "Nested capture maps source to test" assert_nested_capture_maps_source_to_test
test "Missing mapped test file fails" assert_missing_mapped_test_file_fails
test "Default path placeholder stays literal" assert_default_path_placeholder_stays_literal
test "Duplicate commands run once" assert_duplicate_commands_run_once
test "Static duplicate across files runs once" assert_static_duplicate_across_files_runs_once
test "Path placeholder quotes spaces" assert_path_placeholder_quotes_spaces
test "Capture placeholders render" assert_capture_placeholders_render
test "Duplicate capture names fail" assert_duplicate_capture_names_fail
test "Capture names can repeat across sections" assert_capture_names_can_repeat_across_sections
test "Escaped pattern characters match literals" assert_escaped_pattern_characters_match_literals
test "Failures do not stop result collection" assert_failures_do_not_stop_result_collection
test "Shared static failure marks all files failed" assert_shared_static_failure_marks_all_files_failed
test "Verbose failure prints failed command output" assert_verbose_failure_prints_failed_command_output
test "Absolute paths fail" assert_absolute_paths_fail

print_tests_summary

if some_tests_failed; then
    exit 1
fi
