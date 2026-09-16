#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM
cd "$test_dir"

_run_idea_ready()
{
    sh -eu -c '
        _CR_INSTALL_DIR=$1
        shift
        _CR_SUCCESS_EXIT_CODE=0
        _CR_ERROR_EXIT_CODE=1
        _CR_USAGE_EXIT_CODE=2
        EOL="
"
        log_level=1
        log_color=0
        log_interactive=0
        . "$_CR_INSTALL_DIR/lib/utils/log.sh"
        . "$_CR_INSTALL_DIR/lib/utils/fs.sh"
        . "$_CR_INSTALL_DIR/lib/utils/path.sh"
        . "$_CR_INSTALL_DIR/lib/utils/md.sh"
        reinit_log

        _CR_TEMP_RESOURCE_FILE="$PWD/resources"
        : > "$_CR_TEMP_RESOURCE_FILE"
        register_temp_resource()
        {
            printf "%s\n" "$1" >> "$_CR_TEMP_RESOURCE_FILE"
        }
        cleanup()
        {
            command_status=$?
            trap - 0 HUP INT TERM
            while IFS= read -r resource; do
                rm -rf "$resource"
            done < "$_CR_TEMP_RESOURCE_FILE"
            rm -f "$_CR_TEMP_RESOURCE_FILE"
            exit "$command_status"
        }
        trap cleanup 0
        trap "exit 129" HUP
        trap "exit 130" INT
        trap "exit 143" TERM

        if [ "${READY_FAIL_WRITE:-0}" -eq 1 ]; then
            fs_replace()
            {
                return 1
            }
        fi

        . "$_CR_INSTALL_DIR/lib/commands/idea.sh"
        execute_command ready "$@"
    ' idea-ready-test "$PROJECT_ROOT" "$@"
}

_write_test_idea()
{
    fixture_path=$1
    shift
    mkdir -p ".coderail/plans/$fixture_path"
    printf '%s\n' '---' "$@" '---' > ".coderail/plans/$fixture_path/IDEA.md"
}

_expect_ready_failure()
{
    expected_status=$1
    expected_message=$2
    shift 2
    actual_status=0
    _run_idea_ready "$@" > "$test_dir/stdout" 2> "$test_dir/stderr" || actual_status=$?
    [ "$actual_status" -eq "$expected_status" ] && [ ! -s "$test_dir/stdout" ] && \
        grep -Fq -- "$expected_message" "$test_dir/stderr" || return 1
    if [ "$expected_status" -eq 2 ]; then
        grep -Fq 'Usage:' "$test_dir/stderr"
    fi
}

print_tests_header "Idea Ready Command Tests"

_write_test_idea parent 'title: Parent' 'status: split'
cp .coderail/plans/parent/IDEA.md "$test_dir/parent"
_write_test_idea parent/child 'title: Child' 'status: forging' 'custom: preserved'
sed 's/status: forging/status: ready/' .coderail/plans/parent/child/IDEA.md > "$test_dir/expected"
for fixture_file in .coderail/plans/parent/child/IDEA.md "$test_dir/expected"; do
    printf '\n# Context\nstatus: forging\nKeep this body.\n' >> "$fixture_file"
done
printf 'Keep these notes.\n' > .coderail/plans/parent/child/notes.txt
test_expect "ready: normalizes nested full file path" '".coderail/plans/parent/child/IDEA.md" ready' \
    _run_idea_ready .coderail/plans/parent/./child/../child/IDEA.md
test "ready: changes status and preserves metadata and body" cmp "$test_dir/expected" .coderail/plans/parent/child/IDEA.md
test "ready: parent preserved" cmp "$test_dir/parent" .coderail/plans/parent/IDEA.md
test_expect "ready: attachment preserved" 'Keep these notes.' cat .coderail/plans/parent/child/notes.txt
test "ready: does not create specification" test ! -e .coderail/plans/parent/child/SPEC.md
test "ready: rejects already ready idea" _expect_ready_failure 1 'Only forging ideas can be marked as ready:' parent/child
test "ready: repeated call preserves file" cmp "$test_dir/expected" .coderail/plans/parent/child/IDEA.md

_write_test_idea --option-path 'title: Option path' 'status: forging'
test_expect "ready: -- accepts relative path with leading hyphens" '".coderail/plans/--option-path/IDEA.md" ready' \
    _run_idea_ready -- --option-path
test_expect "ready: relative path updates status" "$(printf '%s\n' '---' 'title: Option path' 'status: ready' '---')" \
    cat .coderail/plans/--option-path/IDEA.md

for fixture_status in split unknown ''; do
    _write_test_idea invalid 'title: Invalid'
    if [ -n "$fixture_status" ]; then
        _write_test_idea invalid 'title: Invalid' "status: $fixture_status"
    fi
    cp .coderail/plans/invalid/IDEA.md "$test_dir/original"
    test "ready: rejects status '$fixture_status'" _expect_ready_failure 1 'Only forging ideas can be marked as ready:' invalid
    test "ready: rejected idea preserved" cmp "$test_dir/original" .coderail/plans/invalid/IDEA.md
done
_write_test_idea invalid 'title: Invalid' 'malformed'
cp .coderail/plans/invalid/IDEA.md "$test_dir/original"
test "ready: malformed front matter" _expect_ready_failure 1 'Failed to read idea file: Invalid frontmatter:' invalid
test "ready: malformed idea preserved" cmp "$test_dir/original" .coderail/plans/invalid/IDEA.md
test "ready: missing idea" _expect_ready_failure 1 'Failed to read idea file: File does not exist' missing
for idea_path in /absolute ../outside ''; do
    test "ready: rejects path '$idea_path'" _expect_ready_failure 1 'Invalid idea path:' "$idea_path"
done

test "ready: missing argument" _expect_ready_failure 2 'Exactly one idea path must be provided'
test "ready: multiple arguments" _expect_ready_failure 2 'Exactly one idea path must be provided' parent parent/child
test "ready: unknown option" _expect_ready_failure 2 'Unknown option:' --unknown
test "ready: help rejects a value" _expect_ready_failure 2 '--help does not take an argument' --help=yes
test "ready: help succeeds" _run_idea_ready --help

_write_test_idea failure 'title: Failure' 'status: forging'
cp .coderail/plans/failure/IDEA.md "$test_dir/original"
READY_FAIL_WRITE=1
export READY_FAIL_WRITE
test "ready: write failure reported" _expect_ready_failure 1 'Failed to update idea file:' failure
unset READY_FAIL_WRITE
test "ready: write failure preserves original" cmp "$test_dir/original" .coderail/plans/failure/IDEA.md
test_expect "ready: temporary resources cleaned up" '' find . -name '.cr-tmp-*'

print_tests_summary

if some_tests_failed; then
    exit 1
fi
