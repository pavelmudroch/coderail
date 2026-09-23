#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM
cd "$test_dir"

_run_idea_split()
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
        . "$_CR_INSTALL_DIR/lib/utils/text.sh"
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

        . "$_CR_INSTALL_DIR/lib/commands/idea.sh"
        execute_command split "$@"
    ' idea-split-test "$PROJECT_ROOT" "$@"
}

_write_test_idea()
{
    fixture_path=$1
    shift
    mkdir -p ".coderail/plans/$fixture_path"
    printf '%s\n' '---' "$@" '---' > ".coderail/plans/$fixture_path/IDEA.md"
}

_expect_split_failure()
{
    expected_status=$1
    expected_message=$2
    shift 2
    actual_status=0
    _run_idea_split "$@" > "$test_dir/stdout" 2> "$test_dir/stderr" || actual_status=$?
    [ "$actual_status" -eq "$expected_status" ] && [ ! -s "$test_dir/stdout" ] || return 1
    if [ -n "$expected_message" ]; then
        grep -Fq -- "$expected_message" "$test_dir/stderr" || return 1
    fi
    if [ "$expected_status" -eq 2 ]; then
        grep -Fq 'Usage:' "$test_dir/stderr"
    fi
}

print_tests_header "Idea Split Command Tests"

_write_test_idea parent/nested 'title: Nested' 'status: forging' 'custom: preserved'
printf '\n# Context\nKeep this body.\n' >> .coderail/plans/parent/nested/IDEA.md
printf 'Keep these notes.\n' > .coderail/plans/parent/nested/notes.txt
sed 's/status: forging/status: split/' .coderail/plans/parent/nested/IDEA.md > "$test_dir/expected"
test_expect "split: normalizes file path and reports children in order" \
    '".coderail/plans/parent/nested/IDEA.md" split into ".coderail/plans/parent/nested/hello-world/IDEA.md", ".coderail/plans/parent/nested/second/IDEA.md", ".coderail/plans/parent/nested/third/IDEA.md"' \
    _run_idea_split .coderail/plans/parent/./nested/IDEA.md 'Hello, World!' Second Third
test "split: changes status and preserves metadata and body" cmp "$test_dir/expected" .coderail/plans/parent/nested/IDEA.md
test_expect "split: preserves attachments" 'Keep these notes.' cat .coderail/plans/parent/nested/notes.txt
test_expect "split: first child retains title and starts forging" "$(printf '%s\n' '---' 'title: Hello, World!' 'status: forging' '---')" \
    cat .coderail/plans/parent/nested/hello-world/IDEA.md
for child in Second Third; do
    child_slug=$(printf '%s' "$child" | tr '[:upper:]' '[:lower:]')
    test_expect "split: $child child contents" "$(printf '%s\n' '---' "title: $child" 'status: forging' '---')" \
        cat ".coderail/plans/parent/nested/$child_slug/IDEA.md"
done

_write_test_idea options 'title: Options' 'status: forging'
test_expect "split: -- allows child titles beginning with hyphens" \
    '".coderail/plans/options/IDEA.md" split into ".coderail/plans/options/first/IDEA.md", ".coderail/plans/options/second/IDEA.md"' \
    _run_idea_split options -- --First --Second
test_expect "split: preserves leading hyphens in title" "$(printf '%s\n' '---' 'title: --First' 'status: forging' '---')" \
    cat .coderail/plans/options/first/IDEA.md

test "split: help succeeds" _run_idea_split --help
test "split: missing path" _expect_split_failure 2 'Idea path is required'
test "split: no children" _expect_split_failure 2 'At least two child titles are required' options
test "split: only one child" _expect_split_failure 2 'At least two child titles are required' options One
test "split: unknown option" _expect_split_failure 2 'Unknown option:' --unknown
test "split: help rejects a value" _expect_split_failure 2 '--help does not take an argument' --help=yes
test "split: path cannot escape plans directory" _expect_split_failure 1 'Invalid idea path:' ../outside One Two
test "split: missing idea" _expect_split_failure 1 'Failed to read idea file: File does not exist' missing One Two

for idea_status in ready split unknown ''; do
    _write_test_idea invalid 'title: Invalid' "status: $idea_status"
    test "split: rejects status '$idea_status'" _expect_split_failure 1 'Only forging ideas can be marked as split:' invalid One Two
done
printf '# Missing front matter\n' > .coderail/plans/invalid/IDEA.md
test "split: malformed idea" _expect_split_failure 1 'Failed to read idea file: Invalid frontmatter:' invalid One Two
test_expect "split: validation failures create no children" '.coderail/plans/invalid/IDEA.md' \
    find .coderail/plans/invalid -type f

_write_test_idea rollback 'title: Rollback' 'status: forging'
printf 'Preserve me.\n' > .coderail/plans/rollback/blocked
cp -R .coderail/plans/rollback "$test_dir/original"
# The second child fails after the first was staged; this path has no diagnostic.
test "split: blocked second child fails" _expect_split_failure 1 '' rollback First Blocked
test "split: failure preserves parent and attachments" diff -r "$test_dir/original" .coderail/plans/rollback
test "split: failure leaves no first child" command test ! -e .coderail/plans/rollback/first
test_expect "split: temporary resources cleaned up" '' find . -name '.cr-tmp-*'

print_tests_summary

if some_tests_failed; then
    exit 1
fi
