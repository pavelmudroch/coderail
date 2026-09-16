#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM
cd "$test_dir"

_run_idea_create()
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
        execute_command create "$@"
    ' idea-create-test "$PROJECT_ROOT" "$@"
}

_expect_create_failure()
{
    expected_status=$1
    expected_message=$2
    shift 2
    actual_status=0
    _run_idea_create "$@" > "$test_dir/stdout" 2> "$test_dir/stderr" || actual_status=$?
    [ "$actual_status" -eq "$expected_status" ] && [ ! -s "$test_dir/stdout" ] && \
        grep -Fq -- "$expected_message" "$test_dir/stderr" || return 1
    if [ "$expected_status" -eq 2 ]; then
        grep -Fq 'Usage:' "$test_dir/stderr"
    fi
}

print_tests_header "Idea Create Command Tests"

test_expect "create: creates plans directory and slugged path" '.coderail/plans/hello-world/IDEA.md' \
    _run_idea_create 'Hello, World!'
test_expect "create: initial front matter" "$(printf '%s\n' '---' 'title: Hello, World!' 'status: forging' '---')" \
    cat .coderail/plans/hello-world/IDEA.md

printf '\nPreserve this body.\n' >> .coderail/plans/hello-world/IDEA.md
cp .coderail/plans/hello-world/IDEA.md "$test_dir/original"
test "create: rejects duplicate slug" _expect_create_failure 1 'Idea already exists at path:' 'Hello World'
test "create: duplicate preserves original" cmp "$test_dir/original" .coderail/plans/hello-world/IDEA.md

mkdir -p .coderail/plans/parent/nested
printf '%s\n' '---' 'title: Nested' 'status: split' '---' > .coderail/plans/parent/nested/IDEA.md
cp .coderail/plans/parent/nested/IDEA.md "$test_dir/parent"
test_expect "create: short parent option and relative path" '.coderail/plans/parent/nested/first/IDEA.md' \
    _run_idea_create -p parent/nested First
test_expect "create: long parent option and full file path" '.coderail/plans/parent/nested/second/IDEA.md' \
    _run_idea_create --parent .coderail/plans/parent/nested/IDEA.md Second
test_expect "create: parent=value normalizes relative components" '.coderail/plans/parent/nested/third/IDEA.md' \
    _run_idea_create --parent=parent/./nested/../nested Third
test_expect "create: child starts forging" "$(printf '%s\n' '---' 'title: Third' 'status: forging' '---')" \
    cat .coderail/plans/parent/nested/third/IDEA.md
test "create: parent preserved" cmp "$test_dir/parent" .coderail/plans/parent/nested/IDEA.md

test_expect "create: -- allows a leading hyphen" '.coderail/plans/option-title/IDEA.md' \
    _run_idea_create -- --option-title
test "create: help succeeds" _run_idea_create --help
test "create: missing title" _expect_create_failure 2 'Exactly one idea title must be provided'
test "create: multiple titles" _expect_create_failure 2 'Multiple idea titles provided' One Two
test "create: unknown option" _expect_create_failure 2 'Unknown option:' --unknown
test "create: help rejects a value" _expect_create_failure 2 '--help does not take an argument' --help=yes
test "create: empty parent argument" _expect_create_failure 2 'Missing argument for --parent option' -p '' Child
test "create: empty parent=value" _expect_create_failure 2 'Missing argument for --parent option' --parent= Child

test "create: missing parent" _expect_create_failure 1 'Failed to read parent idea file: File does not exist' -p missing Child
test "create: parent cannot escape plans directory" _expect_create_failure 1 'Invalid parent idea path:' -p ../outside Child
for parent_status in forging ready; do
    printf '%s\n' '---' 'title: Parent' "status: $parent_status" '---' > .coderail/plans/parent/IDEA.md
    test "create: rejects $parent_status parent" _expect_create_failure 1 "Parent idea must be in 'split' status" -p parent Child
done
printf '# Missing front matter\n' > .coderail/plans/parent/IDEA.md
test "create: malformed parent" _expect_create_failure 1 'Failed to read parent idea file: Invalid frontmatter:' -p parent Child
test_expect "create: failures leave idea count unchanged" 7 \
    sh -c 'find .coderail/plans -name IDEA.md -type f | wc -l | tr -d " "'

mkdir .coderail/plans/attachments
printf 'Keep these notes.\n' > .coderail/plans/attachments/notes.txt
test_expect "create: existing directory accepts idea" '.coderail/plans/attachments/IDEA.md' \
    _run_idea_create Attachments
test_expect "create: preserves attachments" 'Keep these notes.' cat .coderail/plans/attachments/notes.txt

printf 'Preserve me.\n' > .coderail/plans/blocked
test "create: blocked destination fails" _expect_create_failure 1 'Cannot write to' Blocked
test_expect "create: blocked destination preserved" 'Preserve me.' cat .coderail/plans/blocked
test_expect "create: temporary resources cleaned up" '' find . -name '.cr-tmp-*'

print_tests_summary

if some_tests_failed; then
    exit 1
fi
