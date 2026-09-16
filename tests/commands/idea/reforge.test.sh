#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM
cd "$test_dir"

_run_idea_reforge()
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

        if [ "${REFORGE_FAIL_WRITE:-0}" -eq 1 ]; then
            fs_replace()
            {
                return 1
            }
        fi

        . "$_CR_INSTALL_DIR/lib/commands/idea.sh"
        execute_command reforge "$@"
    ' idea-reforge-test "$PROJECT_ROOT" "$@"
}

_write_test_idea()
{
    fixture_path=$1
    shift
    mkdir -p ".coderail/plans/$fixture_path"
    printf '%s\n' '---' "$@" '---' > ".coderail/plans/$fixture_path/IDEA.md"
}

_expect_reforge_failure()
{
    expected_status=$1
    expected_message=$2
    shift 2
    actual_status=0
    _run_idea_reforge "$@" > "$test_dir/stdout" 2> "$test_dir/stderr" || actual_status=$?
    [ "$actual_status" -eq "$expected_status" ] && [ ! -s "$test_dir/stdout" ] && \
        grep -Fq -- "$expected_message" "$test_dir/stderr" || return 1
    if [ "$expected_status" -eq 2 ]; then
        grep -Fq 'Usage:' "$test_dir/stderr"
    fi
}

print_tests_header "Idea Reforge Command Tests"

_write_test_idea parent 'title: Parent' 'status: split'
cp .coderail/plans/parent/IDEA.md "$test_dir/parent"
_write_test_idea parent/child 'title: Child' 'status: ready' 'custom: preserved'
sed 's/status: ready/status: forging/' .coderail/plans/parent/child/IDEA.md > "$test_dir/expected"
for fixture_file in .coderail/plans/parent/child/IDEA.md "$test_dir/expected"; do
    printf '\n# Context\nstatus: ready\nKeep this body.\n' >> "$fixture_file"
done
printf 'Keep these notes.\n' > .coderail/plans/parent/child/notes.txt
test_expect "reforge: normalizes nested full file path" '".coderail/plans/parent/child/IDEA.md" forging' \
    _run_idea_reforge .coderail/plans/parent/./child/../child/IDEA.md
test "reforge: changes status and preserves metadata and body" cmp "$test_dir/expected" .coderail/plans/parent/child/IDEA.md
test "reforge: parent preserved" cmp "$test_dir/parent" .coderail/plans/parent/IDEA.md
test_expect "reforge: attachment preserved" 'Keep these notes.' cat .coderail/plans/parent/child/notes.txt
test "reforge: rejects already forging idea" _expect_reforge_failure 1 'Only ready ideas can be reforged:' parent/child
test "reforge: repeated call preserves file" cmp "$test_dir/expected" .coderail/plans/parent/child/IDEA.md

_write_test_idea --option-path 'title: Option path' 'status: ready'
test_expect "reforge: -- accepts relative path with leading hyphens" '".coderail/plans/--option-path/IDEA.md" forging' \
    _run_idea_reforge -- --option-path
test_expect "reforge: relative path updates status" "$(printf '%s\n' '---' 'title: Option path' 'status: forging' '---')" \
    cat .coderail/plans/--option-path/IDEA.md

for fixture_status in split unknown ''; do
    _write_test_idea invalid 'title: Invalid'
    if [ -n "$fixture_status" ]; then
        _write_test_idea invalid 'title: Invalid' "status: $fixture_status"
    fi
    cp .coderail/plans/invalid/IDEA.md "$test_dir/original"
    test "reforge: rejects status '$fixture_status'" _expect_reforge_failure 1 'Only ready ideas can be reforged:' invalid
    test "reforge: rejected idea preserved" cmp "$test_dir/original" .coderail/plans/invalid/IDEA.md
done
_write_test_idea invalid 'title: Invalid' 'malformed'
cp .coderail/plans/invalid/IDEA.md "$test_dir/original"
test "reforge: malformed front matter" _expect_reforge_failure 1 'Failed to read idea file: Invalid frontmatter:' invalid
test "reforge: malformed idea preserved" cmp "$test_dir/original" .coderail/plans/invalid/IDEA.md
test "reforge: missing idea" _expect_reforge_failure 1 'Failed to read idea file: File does not exist' missing
for idea_path in /absolute ../outside ''; do
    test "reforge: rejects path '$idea_path'" _expect_reforge_failure 1 'Invalid idea path:' "$idea_path"
done

test "reforge: missing argument" _expect_reforge_failure 2 'Exactly one idea path must be provided'
test "reforge: multiple arguments" _expect_reforge_failure 2 'Exactly one idea path must be provided' parent parent/child
test "reforge: unknown option" _expect_reforge_failure 2 'Unknown option:' --unknown
test "reforge: help rejects a value" _expect_reforge_failure 2 '--help does not take an argument' --help=yes
test "reforge: help succeeds" _run_idea_reforge --help

_write_test_idea failure 'title: Failure' 'status: ready'
cp .coderail/plans/failure/IDEA.md "$test_dir/original"
REFORGE_FAIL_WRITE=1
export REFORGE_FAIL_WRITE
test "reforge: write failure reported" _expect_reforge_failure 1 'Failed to update idea file:' failure
unset REFORGE_FAIL_WRITE
test "reforge: write failure preserves original" cmp "$test_dir/original" .coderail/plans/failure/IDEA.md
test_expect "reforge: temporary resources cleaned up" '' find . -name '.cr-tmp-*'

print_tests_summary

if some_tests_failed; then
    exit 1
fi
