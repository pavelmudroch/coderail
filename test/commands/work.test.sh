#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
CR=$PROJECT_ROOT/bin/cr
TEMP_DIR=${TMPDIR:-/tmp}
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-work-test.XXXXXX")

. "$PROJECT_ROOT/test/suite.sh"

cleanup() {
    chmod -R u+rwX "$tmp_dir" 2>/dev/null || :
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

fail() {
    echo "FAIL: $1" >&2
    exit 1
}

assert_file() {
    [ -f "$1" ] || fail "missing file: $1"
}

assert_path_missing() {
    [ ! -e "$1" ] || fail "unexpected path: $1"
}

assert_file_empty() {
    [ ! -s "$1" ] || fail "$1 should be empty"
}

assert_file_content() {
    file=$1
    expected=$2
    expected_file=$tmp_dir/expected-content

    assert_file "$file"
    printf '%s\n' "$expected" > "$expected_file"
    cmp "$expected_file" "$file" >/dev/null || fail "$file content differs"
}

assert_contains() {
    grep -F -- "$2" "$1" >/dev/null || fail "$1 does not contain: $2"
}

assert_success() {
    [ "$run_status" -eq 0 ] || fail "expected success, got status $run_status"
}

assert_failure() {
    [ "$run_status" -ne 0 ] || fail "expected failure"
}

assert_usage_failure() {
    [ "$run_status" -eq 2 ] || fail "expected usage failure, got status $run_status"
}

assert_branch() {
    actual_branch=$(git -C "$1" branch --show-current)
    [ "$actual_branch" = "$2" ] || fail "expected branch $2, got $actual_branch"
}

assert_no_staged_changes() {
    git -C "$1" diff --cached --quiet || fail "$1 has staged changes"
}

assert_clean_worktree() {
    worktree_status=$(git -C "$1" status --porcelain --untracked-files=all)
    [ -z "$worktree_status" ] || fail "$1 has worktree changes"
}

assert_staged_file_content() {
    repository=$1
    path=$2
    expected=$3
    actual_file=$tmp_dir/staged-content
    expected_file=$tmp_dir/expected-content

    git -C "$repository" show ":$path" > "$actual_file" ||
        fail "missing staged file: $path"
    printf '%s\n' "$expected" > "$expected_file"
    cmp "$expected_file" "$actual_file" >/dev/null ||
        fail "staged $path content differs"
}

assert_head_file_content() {
    repository=$1
    path=$2
    expected=$3
    actual_file=$tmp_dir/head-content
    expected_file=$tmp_dir/expected-content

    git -C "$repository" show "HEAD:$path" > "$actual_file" ||
        fail "missing HEAD file: $path"
    printf '%s\n' "$expected" > "$expected_file"
    cmp "$expected_file" "$actual_file" >/dev/null ||
        fail "HEAD $path content differs"
}

assert_untracked() {
    if git -C "$1" ls-files --error-unmatch -- "$2" >/dev/null 2>&1; then
        fail "$2 should be untracked"
    fi
}

assert_head_commit_message() {
    repository=$1
    expected=$2
    actual_file=$tmp_dir/head-commit-message

    git -C "$repository" log -1 --format=%B | sed '$d' > "$actual_file"
    assert_file_content "$actual_file" "$expected"
}

create_project() {
    project_dir=$tmp_dir/$1

    mkdir -p "$project_dir/.coderail"
    printf 'repo config\n' > "$project_dir/.coderail/conf.ini"
    printf '[default]\ntrue\n' > "$project_dir/.coderail/test.map"

    printf '%s\n' "$project_dir"
}

create_git_project() {
    project_dir=$(create_project "$1")

    git init -q "$project_dir"
    git -C "$project_dir" config user.email test@example.com
    git -C "$project_dir" config user.name 'CodeRail Test'
    git -C "$project_dir" add .coderail
    git -C "$project_dir" commit -q -m 'Initial project'

    printf '%s\n' "$project_dir"
}

create_git_repo() {
    project_dir=$tmp_dir/$1

    mkdir "$project_dir"
    git init -q "$project_dir"
    git -C "$project_dir" config user.email test@example.com
    git -C "$project_dir" config user.name 'CodeRail Test'
    git -C "$project_dir" commit --allow-empty -q -m 'Initial project'

    printf '%s\n' "$project_dir"
}

commit_all() {
    git -C "$1" add -A
    git -C "$1" commit -q -m "$2"
}

start_recorded_work() {
    work_dir=$1

    "$CR" --cwd "$work_dir" work start 'Finish feature' >/dev/null 2>/dev/null
    git -C "$work_dir" add -A
    git -C "$work_dir" commit -q -m 'Start work'
}

create_recorded_work() {
    work_dir=$(create_git_project "$1")

    start_recorded_work "$work_dir"
    printf '%s\n' "$work_dir"
}

write_ticket() {
    ticket_file=$1
    ticket_id=$2
    ticket_slug=$3
    ticket_title=$4
    ticket_status=$5
    ticket_extra=$6

    mkdir -p "$(dirname "$ticket_file")"
    printf '%s\n' \
        '---' \
        "id: $ticket_id" \
        "slug: $ticket_slug" \
        "title: $ticket_title" \
        "status: $ticket_status" \
        'created_at: 2024-06-01T12:00:00Z' \
        'updated_at: 2024-06-01T12:00:00Z' \
        'dependencies: ' \
        "$ticket_extra" \
        '---' \
        '' \
        "# $ticket_title" > "$ticket_file"
}

run_cr() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" "$@" > "$run_stdout" 2> "$run_stderr" < /dev/null
    run_status=$?
    set -e
}

run_cr_with_input() {
    work_dir=$1
    input=$2
    shift 2

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    printf '%s' "$input" | "$CR" --cwd "$work_dir" "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

write_fake_commit_agent() {
    fake_dir=$1

    mkdir -p "$fake_dir"
    cat > "$fake_dir/fake-commit-agent" <<'EOF'
#!/usr/bin/env sh

set -eu

: "${FAKE_COMMIT_LOG:?}"

printf '%s\n' "${0##*/}" > "$FAKE_COMMIT_LOG"
printf '%s\n' "$@" >> "$FAKE_COMMIT_LOG"

if [ "${FAKE_COMMIT_FAIL:-false}" = true ]; then
    echo 'fake commit agent failure' >&2
    exit 7
fi

printf '%s\n' "${FAKE_COMMIT_OUTPUT:?}"
EOF
    chmod 755 "$fake_dir/fake-commit-agent"

    for fake_tool in codex copilot claude gemini; do
        ln -s fake-commit-agent "$fake_dir/$fake_tool"
    done
}

run_finish_with_fake_agent() {
    work_dir=$1
    fake_dir=$2
    input=$3

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr
    run_fake_commit_log=$fake_dir/commit-agent.log

    : > "$run_fake_commit_log"

    set +e
    printf '%s' "$input" |
        FAKE_COMMIT_FAIL=${FAKE_COMMIT_FAIL-false} \
        FAKE_COMMIT_LOG=$run_fake_commit_log \
        FAKE_COMMIT_OUTPUT=${FAKE_COMMIT_OUTPUT-} \
        PATH="$fake_dir:$PATH" \
        "$CR" --cwd "$work_dir" work finish > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_finish_with_path() {
    work_dir=$1
    path=$2
    input=$3

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    printf '%s' "$input" |
        PATH="$path" "$CR" --cwd "$work_dir" work finish > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_work_record() {
    record_file=$1
    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    (
        . "$PROJECT_ROOT/lib/utils/work.sh"
        work_read_record "$record_file" || exit $?
        printf '%s\n%s\n%s\n' "$work_base_branch" "$work_branch" "$work_name"
    ) > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_top_level_help_lists_work() {
    work_dir=$tmp_dir/top-level-help
    mkdir "$work_dir"

    run_cr "$work_dir" --help

    assert_success
    assert_contains "$run_stdout" '  work          Manage branch-local work'
    assert_file_empty "$run_stderr"
}

assert_work_help_and_dispatch() {
    work_dir=$(create_project help)

    run_cr "$work_dir" work --help
    assert_success
    assert_contains "$run_stdout" 'cr work <command>'
    assert_contains "$run_stdout" '  start'
    assert_contains "$run_stdout" '  finish'
    assert_file_empty "$run_stderr"

    run_cr "$work_dir" work start --help
    assert_success
    assert_contains "$run_stdout" 'cr work start <work-name>'
    assert_file_empty "$run_stderr"

    run_cr "$work_dir" work finish --help
    assert_success
    assert_contains "$run_stdout" 'cr work finish'
    assert_file_empty "$run_stderr"

    run_cr "$work_dir" work unknown
    assert_usage_failure
    assert_contains "$run_stderr" 'error: unknown command: unknown'
}

assert_work_rejects_invalid_arguments() {
    work_dir=$(create_project invalid-arguments)

    run_cr "$work_dir" work start
    assert_usage_failure
    assert_contains "$run_stderr" 'error: missing work name'

    run_cr "$work_dir" work start one two
    assert_usage_failure
    assert_contains "$run_stderr" 'error: unexpected argument: two'

    run_cr "$work_dir" work start ''
    assert_usage_failure
    assert_contains "$run_stderr" 'error: work name must be non-empty and single-line'

    run_cr "$work_dir" work start "first
second"
    assert_usage_failure
    assert_contains "$run_stderr" 'error: work name must be non-empty and single-line'

    run_cr "$work_dir" work start '!!!'
    assert_usage_failure
    assert_contains "$run_stderr" 'error: work name cannot be slugified: !!!'

    run_cr "$work_dir" work finish codex
    assert_usage_failure
    assert_contains "$run_stderr" 'error: unexpected argument: codex'
}

assert_start_requires_git_repository() {
    work_dir=$(create_project no-git)

    run_cr "$work_dir" work start 'Add feature'

    assert_failure
    assert_contains "$run_stderr" 'error: work start requires a Git repository'
}

assert_start_requires_coderail_initialization() {
    work_dir=$(create_git_repo no-coderail)

    run_cr "$work_dir" work start 'Add feature'

    assert_failure
    assert_contains "$run_stderr" 'error: coderail directory not found: .coderail; run cr init before proceeding'
}

assert_start_requires_clean_worktree() {
    work_dir=$(create_git_project dirty-worktree)
    base_branch=$(git -C "$work_dir" branch --show-current)
    printf 'untracked\n' > "$work_dir/changes.txt"

    run_cr "$work_dir" work start 'Add feature'

    assert_failure
    assert_contains "$run_stderr" 'error: worktree must be clean before starting work'
    assert_branch "$work_dir" "$base_branch"
    if git -C "$work_dir" show-ref --verify --quiet refs/heads/coderail/add-feature; then
        fail 'work branch should not exist'
    fi
}

assert_start_requires_named_branch() {
    work_dir=$(create_git_project detached-head)
    git -C "$work_dir" checkout --detach -q

    run_cr "$work_dir" work start 'Add feature'

    assert_failure
    assert_contains "$run_stderr" 'error: work start requires a named current branch'
}

assert_start_rejects_existing_branch() {
    work_dir=$(create_git_project duplicate-branch)
    base_branch=$(git -C "$work_dir" branch --show-current)
    git -C "$work_dir" branch coderail/add-feature

    run_cr "$work_dir" work start 'Add feature'

    assert_failure
    assert_contains "$run_stderr" 'error: work branch already exists: coderail/add-feature'
    assert_branch "$work_dir" "$base_branch"
}

assert_start_creates_work_record_and_removes_inherited_workflow() {
    work_dir=$(create_git_project start)
    base_branch=$(git -C "$work_dir" branch --show-current)
    mkdir -p "$work_dir/.coderail/notes"
    printf 'scope\n' > "$work_dir/.coderail/SCOPE.md"
    printf 'note\n' > "$work_dir/.coderail/notes/plan.md"
    commit_all "$work_dir" 'Add inherited workflow'

    run_cr "$work_dir" work start 'Add Feature!'

    assert_success
    assert_file_empty "$run_stdout"
    assert_file_empty "$run_stderr"
    assert_branch "$work_dir" coderail/add-feature
    assert_file_content "$work_dir/.coderail/work.ini" "base_branch=$base_branch
work_branch=coderail/add-feature
work_name=Add Feature!"
    assert_untracked "$work_dir" .coderail/work.ini
    assert_no_staged_changes "$work_dir"
    assert_path_missing "$work_dir/.coderail/SCOPE.md"
    assert_path_missing "$work_dir/.coderail/notes/plan.md"
    assert_file_content "$work_dir/.coderail/conf.ini" 'repo config'
    assert_file_content "$work_dir/.coderail/test.map" '[default]
true'
}

assert_start_supports_nested_work() {
    work_dir=$(create_git_project nested)
    base_branch=$(git -C "$work_dir" branch --show-current)

    run_cr "$work_dir" work start 'Parent work'
    assert_success
    commit_all "$work_dir" 'Start parent work'

    run_cr "$work_dir" work start 'Child work'

    assert_success
    assert_branch "$work_dir" coderail/child-work
    assert_file_content "$work_dir/.coderail/work.ini" 'base_branch=coderail/parent-work
work_branch=coderail/child-work
work_name=Child work'
    parent_record=$tmp_dir/parent-work.ini
    git -C "$work_dir" show coderail/parent-work:.coderail/work.ini > "$parent_record"
    assert_file_content "$parent_record" "base_branch=$base_branch
work_branch=coderail/parent-work
work_name=Parent work"
    assert_no_staged_changes "$work_dir"
}

assert_work_record_validation() {
    record_file=$tmp_dir/work.ini

    printf '%s\n' \
        'base_branch=main' \
        'work_branch=coderail/add-feature' \
        'work_name=Add feature' > "$record_file"
    run_work_record "$record_file"
    assert_success
    assert_file_content "$run_stdout" 'main
coderail/add-feature
Add feature'

    marker_file=$tmp_dir/record-sourced
    expected_name=$(printf '$(touch %s)' "$marker_file")
    printf '%s\n' \
        'base_branch=main' \
        'work_branch=coderail/add-feature' \
        "work_name=$expected_name" > "$record_file"
    run_work_record "$record_file"
    assert_success
    assert_path_missing "$marker_file"

    printf '%s\n' \
        'base_branch=main' \
        'base_branch=other' \
        'work_branch=coderail/add-feature' \
        'work_name=Add feature' > "$record_file"
    run_work_record "$record_file"
    assert_failure

    printf '%s\n' \
        'base_branch=main' \
        'work_branch=coderail/add-feature' > "$record_file"
    run_work_record "$record_file"
    assert_failure

    printf '%s\n' \
        'base_branch=' \
        'work_branch=coderail/add-feature' \
        'work_name=Add feature' > "$record_file"
    run_work_record "$record_file"
    assert_failure

    printf '%s\n' \
        'base_branch=main' \
        'work_branch=coderail/add-feature' \
        'work_name=Add feature' \
        'continued value' > "$record_file"
    run_work_record "$record_file"
    assert_failure

    printf '%s\n' \
        'base_branch main' \
        'work_branch=coderail/add-feature' \
        'work_name=Add feature' > "$record_file"
    run_work_record "$record_file"
    assert_failure
}

assert_finish_rejects_invalid_or_mismatched_records() {
    missing_dir=$(create_recorded_work finish-missing-record)
    git -C "$missing_dir" rm -q .coderail/work.ini
    git -C "$missing_dir" commit -q -m 'Remove work record'

    run_cr "$missing_dir" work finish
    assert_failure
    assert_contains "$run_stderr" 'error: work record is invalid: .coderail/work.ini'
    assert_branch "$missing_dir" coderail/finish-feature

    malformed_dir=$(create_recorded_work finish-malformed-record)
    printf '%s\n' \
        'base_branch=main' \
        'work_branch=coderail/finish-feature' \
        'work_name=Finish feature' \
        'unexpected=value' > "$malformed_dir/.coderail/work.ini"
    git -C "$malformed_dir" add .coderail/work.ini
    git -C "$malformed_dir" commit -q -m 'Malformed work record'

    run_cr "$malformed_dir" work finish
    assert_failure
    assert_contains "$run_stderr" 'error: work record is invalid: .coderail/work.ini'
    assert_branch "$malformed_dir" coderail/finish-feature

    mismatch_dir=$(create_recorded_work finish-mismatched-record)
    printf '%s\n' \
        'base_branch=master' \
        'work_branch=coderail/other-work' \
        'work_name=Other work' > "$mismatch_dir/.coderail/work.ini"
    git -C "$mismatch_dir" add .coderail/work.ini
    git -C "$mismatch_dir" commit -q -m 'Mismatch work record'

    run_cr "$mismatch_dir" work finish
    assert_failure
    assert_contains "$run_stderr" 'error: current branch does not match work record: coderail/other-work'
    assert_branch "$mismatch_dir" coderail/finish-feature

    detached_dir=$(create_recorded_work finish-detached)
    git -C "$detached_dir" checkout --detach -q

    run_cr "$detached_dir" work finish
    assert_failure
    assert_contains "$run_stderr" 'error: work finish requires a named current branch'
}

assert_finish_rejects_untracked_or_unstaged_changes() {
    untracked_dir=$(create_recorded_work finish-untracked)
    printf 'untracked\n' > "$untracked_dir/untracked.txt"

    run_cr "$untracked_dir" work finish
    assert_failure
    assert_contains "$run_stderr" 'error: work finish requires no untracked files'
    assert_branch "$untracked_dir" coderail/finish-feature

    unstaged_dir=$(create_recorded_work finish-unstaged)
    printf 'initial\n' > "$unstaged_dir/tracked.txt"
    commit_all "$unstaged_dir" 'Add tracked file'
    printf 'changed\n' > "$unstaged_dir/tracked.txt"

    run_cr "$unstaged_dir" work finish
    assert_failure
    assert_contains "$run_stderr" 'error: work finish requires no unstaged changes'
    assert_branch "$unstaged_dir" coderail/finish-feature
}

assert_finish_returns_to_work_branch_when_base_is_dirty() {
    work_dir=$(create_recorded_work finish-dirty-base)
    base_branch=$(git -C "$work_dir" show coderail/finish-feature:.coderail/work.ini |
        sed -n 's/^base_branch=//p')
    git_dir=$(git -C "$work_dir" rev-parse --absolute-git-dir)
    hook_file=$git_dir/hooks/post-checkout

    mkdir -p "$git_dir/hooks"
    printf '%s\n' \
        '#!/usr/bin/env sh' \
        "if [ \"\$(git branch --show-current)\" = \"$base_branch\" ]; then" \
        '    printf "base dirty\\n" > base-dirty.txt' \
        'fi' > "$hook_file"
    chmod 755 "$hook_file"

    run_cr "$work_dir" work finish

    assert_failure
    assert_contains "$run_stderr" 'error: base branch must be clean before integrating work'
    assert_branch "$work_dir" coderail/finish-feature
    assert_file_content "$work_dir/base-dirty.txt" 'base dirty'
}

assert_finish_requires_ticket_readiness_before_checkpoint() {
    work_dir=$(create_recorded_work finish-ticket-readiness)
    ticket_file=$work_dir/.coderail/tickets/active/0001-pending-ticket.md
    head_before=$(git -C "$work_dir" rev-parse HEAD)

    write_ticket "$ticket_file" 0001 pending-ticket 'Pending Ticket' active ''
    printf 'feature\n' > "$work_dir/feature.txt"
    git -C "$work_dir" add .coderail/tickets/active/0001-pending-ticket.md feature.txt

    run_cr "$work_dir" work finish

    assert_failure
    assert_contains "$run_stderr" 'error: active tickets are not resolved: .coderail/tickets/active/0001-pending-ticket.md'
    [ "$(git -C "$work_dir" rev-parse HEAD)" = "$head_before" ] ||
        fail 'finish created a checkpoint before ticket readiness'
    assert_branch "$work_dir" coderail/finish-feature
}

assert_finish_checkpoints_and_stages_code_integration() {
    work_dir=$(create_recorded_work finish-checkpoint)
    base_branch=$(git -C "$work_dir" show coderail/finish-feature:.coderail/work.ini |
        sed -n 's/^base_branch=//p')

    printf 'feature\n' > "$work_dir/feature.txt"
    git -C "$work_dir" add feature.txt

    run_cr "$work_dir" work finish

    assert_success
    assert_branch "$work_dir" "$base_branch"
    [ "$(git -C "$work_dir" log -1 --format=%s coderail/finish-feature)" = \
        'chore(work): save work progress' ] || fail 'missing work checkpoint commit'
    assert_staged_file_content "$work_dir" feature.txt 'feature'
    assert_head_file_content "$work_dir" .coderail/conf.ini 'repo config'
}

assert_finish_restores_managed_files_and_permanent_config() {
    work_dir=$(create_git_project finish-managed-cleanup)
    base_branch=$(git -C "$work_dir" branch --show-current)
    mkdir -p "$work_dir/.coderail/notes"
    printf 'base edit\n' > "$work_dir/.coderail/notes/edit.md"
    printf 'base delete\n' > "$work_dir/.coderail/delete.md"
    chmod 755 "$work_dir/.coderail/notes/edit.md"
    commit_all "$work_dir" 'Add managed base files'

    start_recorded_work "$work_dir"
    printf 'work edit\n' > "$work_dir/.coderail/notes/edit.md"
    printf 'work child\n' > "$work_dir/.coderail/child.md"
    printf 'updated config\n' > "$work_dir/.coderail/conf.ini"
    printf 'updated map\n' > "$work_dir/.coderail/test.map"
    printf 'feature\n' > "$work_dir/feature.txt"
    git -C "$work_dir" add -A

    run_cr "$work_dir" work finish

    assert_success
    assert_branch "$work_dir" "$base_branch"
    assert_file_content "$work_dir/.coderail/notes/edit.md" 'base edit'
    [ -x "$work_dir/.coderail/notes/edit.md" ] || fail 'managed file mode changed'
    assert_file_content "$work_dir/.coderail/delete.md" 'base delete'
    assert_path_missing "$work_dir/.coderail/child.md"
    assert_staged_file_content "$work_dir" feature.txt 'feature'
    assert_staged_file_content "$work_dir" .coderail/conf.ini 'updated config'
    assert_staged_file_content "$work_dir" .coderail/test.map 'updated map'
}

assert_finish_restores_parent_workflow_for_nested_work() {
    work_dir=$(create_git_project finish-nested)

    start_recorded_work "$work_dir"
    printf 'parent workflow\n' > "$work_dir/.coderail/PARENT.md"
    commit_all "$work_dir" 'Add parent workflow'
    parent_branch=$(git -C "$work_dir" branch --show-current)
    parent_record=$(git -C "$work_dir" show "$parent_branch:.coderail/work.ini")

    "$CR" --cwd "$work_dir" work start 'Child feature' >/dev/null 2>/dev/null
    printf 'child feature\n' > "$work_dir/child.txt"
    git -C "$work_dir" add -A

    run_cr "$work_dir" work finish

    assert_success
    assert_branch "$work_dir" "$parent_branch"
    assert_file_content "$work_dir/.coderail/work.ini" "$parent_record"
    assert_file_content "$work_dir/.coderail/PARENT.md" 'parent workflow'
    assert_staged_file_content "$work_dir" child.txt 'child feature'
}

assert_finish_resolves_managed_conflicts_to_base() {
    work_dir=$(create_git_project finish-managed-conflict)
    base_branch=$(git -C "$work_dir" branch --show-current)
    printf 'original\n' > "$work_dir/.coderail/SCOPE.md"
    commit_all "$work_dir" 'Add managed scope'

    start_recorded_work "$work_dir"
    printf 'work version\n' > "$work_dir/.coderail/SCOPE.md"
    commit_all "$work_dir" 'Change scope on work'

    git -C "$work_dir" switch -q "$base_branch"
    printf 'base version\n' > "$work_dir/.coderail/SCOPE.md"
    commit_all "$work_dir" 'Change scope on base'
    git -C "$work_dir" switch -q coderail/finish-feature

    run_cr "$work_dir" work finish

    assert_success
    assert_branch "$work_dir" "$base_branch"
    assert_file_content "$work_dir/.coderail/SCOPE.md" 'base version'
    assert_no_staged_changes "$work_dir"
}

assert_finish_recovers_code_conflicts_to_work_branch() {
    work_dir=$(create_git_project finish-code-conflict)
    base_branch=$(git -C "$work_dir" branch --show-current)
    printf 'original\n' > "$work_dir/code.txt"
    commit_all "$work_dir" 'Add code'

    start_recorded_work "$work_dir"
    printf 'work version\n' > "$work_dir/code.txt"
    commit_all "$work_dir" 'Change code on work'

    git -C "$work_dir" switch -q "$base_branch"
    printf 'base version\n' > "$work_dir/code.txt"
    commit_all "$work_dir" 'Change code on base'
    git -C "$work_dir" switch -q coderail/finish-feature

    run_cr "$work_dir" work finish

    assert_failure
    assert_contains "$run_stderr" 'error: squash integration has conflicts; merge the base branch into the work branch before retrying'
    assert_branch "$work_dir" coderail/finish-feature
    assert_clean_worktree "$work_dir"
}

assert_finish_recovers_failed_squash_to_work_branch() {
    work_dir=$(create_recorded_work finish-failed-squash)
    printf '%s\n' \
        'base_branch=unrelated' \
        'work_branch=coderail/finish-feature' \
        'work_name=Finish feature' > "$work_dir/.coderail/work.ini"
    git -C "$work_dir" add .coderail/work.ini
    git -C "$work_dir" commit -q -m 'Record unrelated base'

    git -C "$work_dir" checkout -q --orphan unrelated
    git -C "$work_dir" add -A
    git -C "$work_dir" commit -q -m 'Create unrelated base'
    git -C "$work_dir" switch -q coderail/finish-feature

    run_cr "$work_dir" work finish

    assert_failure
    assert_contains "$run_stderr" 'error: failed to prepare squash integration'
    assert_branch "$work_dir" coderail/finish-feature
    assert_clean_worktree "$work_dir"
}

assert_finish_reports_noop_after_workflow_cleanup() {
    work_dir=$(create_recorded_work finish-noop)
    base_branch=$(git -C "$work_dir" show coderail/finish-feature:.coderail/work.ini |
        sed -n 's/^base_branch=//p')

    run_cr "$work_dir" work finish

    assert_success
    assert_contains "$run_stdout" 'work produced no integration changes'
    assert_branch "$work_dir" "$base_branch"
    assert_no_staged_changes "$work_dir"
}

assert_finish_cancels_automatic_commit_on_negative_or_eof() {
    negative_dir=$(create_recorded_work finish-automatic-negative)
    negative_base=$(git -C "$negative_dir" show coderail/finish-feature:.coderail/work.ini |
        sed -n 's/^base_branch=//p')
    printf 'negative\n' > "$negative_dir/negative.txt"
    git -C "$negative_dir" add negative.txt

    run_cr_with_input "$negative_dir" 'n
' work finish

    assert_success
    assert_branch "$negative_dir" "$negative_base"
    assert_staged_file_content "$negative_dir" negative.txt 'negative'

    eof_dir=$(create_recorded_work finish-automatic-eof)
    eof_base=$(git -C "$eof_dir" show coderail/finish-feature:.coderail/work.ini |
        sed -n 's/^base_branch=//p')
    printf 'eof\n' > "$eof_dir/eof.txt"
    git -C "$eof_dir" add eof.txt

    run_cr "$eof_dir" work finish

    assert_success
    assert_branch "$eof_dir" "$eof_base"
    assert_staged_file_content "$eof_dir" eof.txt 'eof'
}

assert_finish_retries_and_defaults_automatic_commit_confirmation() {
    retry_dir=$(create_recorded_work finish-automatic-retry)
    printf 'retry\n' > "$retry_dir/retry.txt"
    git -C "$retry_dir" add retry.txt

    run_cr_with_input "$retry_dir" 'maybe
n
' work finish

    assert_success
    assert_contains "$run_stdout" 'Please answer yes or no.'
    assert_staged_file_content "$retry_dir" retry.txt 'retry'

    default_dir=$(create_recorded_work finish-automatic-default)
    fake_dir=$tmp_dir/fake-automatic-default
    printf 'default_tool = codex\n' > "$default_dir/.coderail/conf.ini"
    printf 'default\n' > "$default_dir/default.txt"
    git -C "$default_dir" add .coderail/conf.ini default.txt
    write_fake_commit_agent "$fake_dir"

    FAKE_COMMIT_OUTPUT='Summary: Default automatic commit

Commit:
feat(work): keep staged result

Command:
git commit -m ignored' \
        run_finish_with_fake_agent "$default_dir" "$fake_dir" '
n
'

    assert_success
    assert_file_content "$run_fake_commit_log" 'codex
--sandbox
workspace-write
-c
sandbox_workspace_write.network_access=true
exec
$cr-commit'
    assert_staged_file_content "$default_dir" default.txt 'default'
}

assert_finish_selects_or_cancels_commit_tool() {
    selected_dir=$(create_recorded_work finish-selected-tool)
    selected_fake_dir=$tmp_dir/fake-selected-tool
    printf 'selected\n' > "$selected_dir/selected.txt"
    git -C "$selected_dir" add selected.txt
    write_fake_commit_agent "$selected_fake_dir"

    FAKE_COMMIT_OUTPUT='Summary: Selected tool

Commit:
feat(work): select commit tool

Command:
git commit -m ignored' \
        run_finish_with_fake_agent "$selected_dir" "$selected_fake_dir" 'y
claude
n
'

    assert_success
    assert_file_content "$run_fake_commit_log" 'claude
--dangerously-skip-permissions
-p
/cr-commit'
    assert_staged_file_content "$selected_dir" selected.txt 'selected'

    empty_dir=$(create_recorded_work finish-empty-tool)
    printf 'empty\n' > "$empty_dir/empty.txt"
    git -C "$empty_dir" add empty.txt

    run_cr_with_input "$empty_dir" 'y

' work finish

    assert_success
    assert_staged_file_content "$empty_dir" empty.txt 'empty'

    unsupported_dir=$(create_recorded_work finish-unsupported-tool)
    printf 'unsupported\n' > "$unsupported_dir/unsupported.txt"
    git -C "$unsupported_dir" add unsupported.txt

    run_cr_with_input "$unsupported_dir" 'y
unknown
' work finish

    assert_success
    assert_staged_file_content "$unsupported_dir" unsupported.txt 'unsupported'

    eof_dir=$(create_recorded_work finish-tool-eof)
    printf 'eof\n' > "$eof_dir/eof.txt"
    git -C "$eof_dir" add eof.txt

    run_cr_with_input "$eof_dir" 'y
' work finish

    assert_success
    assert_staged_file_content "$eof_dir" eof.txt 'eof'
}

assert_finish_rejects_invalid_or_unavailable_configured_tool() {
    invalid_dir=$(create_recorded_work finish-invalid-default-tool)
    printf 'default_tool = unknown\n' > "$invalid_dir/.coderail/conf.ini"
    printf 'invalid\n' > "$invalid_dir/invalid.txt"
    git -C "$invalid_dir" add .coderail/conf.ini invalid.txt

    run_cr_with_input "$invalid_dir" 'y
' work finish

    assert_failure
    assert_contains "$run_stderr" 'automatic commit failed'
    assert_staged_file_content "$invalid_dir" invalid.txt 'invalid'

    unavailable_dir=$(create_recorded_work finish-unavailable-default-tool)
    printf 'default_tool = codex\n' > "$unavailable_dir/.coderail/conf.ini"
    printf 'unavailable\n' > "$unavailable_dir/unavailable.txt"
    git -C "$unavailable_dir" add .coderail/conf.ini unavailable.txt

    run_finish_with_path "$unavailable_dir" '/usr/bin:/bin' 'y
'

    assert_failure
    assert_contains "$run_stderr" 'automatic commit failed'
    assert_staged_file_content "$unavailable_dir" unavailable.txt 'unavailable'

    selected_unavailable_dir=$(create_recorded_work finish-unavailable-selected-tool)
    printf 'selected unavailable\n' > "$selected_unavailable_dir/selected-unavailable.txt"
    git -C "$selected_unavailable_dir" add selected-unavailable.txt

    run_finish_with_path "$selected_unavailable_dir" '/usr/bin:/bin' 'y
codex
'

    assert_failure
    assert_contains "$run_stderr" 'automatic commit failed'
    assert_staged_file_content \
        "$selected_unavailable_dir" \
        selected-unavailable.txt \
        'selected unavailable'
}

assert_finish_commits_only_the_parsed_agent_message() {
    work_dir=$(create_recorded_work finish-agent-commit)
    fake_dir=$tmp_dir/fake-agent-commit
    command_marker=$work_dir/agent-command-ran
    printf 'default_tool = codex\n' > "$work_dir/.coderail/conf.ini"
    printf 'committed\n' > "$work_dir/committed.txt"
    git -C "$work_dir" add .coderail/conf.ini committed.txt
    write_fake_commit_agent "$fake_dir"

    FAKE_COMMIT_OUTPUT="Summary: Add feature

Commit:
feat(work): integrate feature

Explain the integrated change.

Command:
touch $command_marker" \
        run_finish_with_fake_agent "$work_dir" "$fake_dir" 'y
maybe

'

    assert_success
    assert_contains "$run_stdout" 'Please answer yes or no.'
    assert_head_commit_message "$work_dir" 'feat(work): integrate feature

Explain the integrated change.'
    assert_no_staged_changes "$work_dir"
    assert_path_missing "$command_marker"
}

assert_finish_preserves_staged_result_after_agent_or_commit_failures() {
    declined_dir=$(create_recorded_work finish-message-declined)
    declined_fake_dir=$tmp_dir/fake-message-declined
    printf 'default_tool = codex\n' > "$declined_dir/.coderail/conf.ini"
    printf 'declined\n' > "$declined_dir/declined.txt"
    git -C "$declined_dir" add .coderail/conf.ini declined.txt
    write_fake_commit_agent "$declined_fake_dir"

    FAKE_COMMIT_OUTPUT='Summary: Declined message

Commit:
feat(work): decline message

Command:
git commit -m ignored' \
        run_finish_with_fake_agent "$declined_dir" "$declined_fake_dir" 'y
n
'

    assert_success
    assert_staged_file_content "$declined_dir" declined.txt 'declined'

    message_eof_dir=$(create_recorded_work finish-message-eof)
    message_eof_fake_dir=$tmp_dir/fake-message-eof
    printf 'default_tool = codex\n' > "$message_eof_dir/.coderail/conf.ini"
    printf 'message eof\n' > "$message_eof_dir/message-eof.txt"
    git -C "$message_eof_dir" add .coderail/conf.ini message-eof.txt
    write_fake_commit_agent "$message_eof_fake_dir"

    FAKE_COMMIT_OUTPUT='Summary: Message EOF

Commit:
feat(work): cancel message approval

Command:
git commit -m ignored' \
        run_finish_with_fake_agent "$message_eof_dir" "$message_eof_fake_dir" 'y
'

    assert_success
    assert_staged_file_content "$message_eof_dir" message-eof.txt 'message eof'

    malformed_dir=$(create_recorded_work finish-malformed-message)
    malformed_fake_dir=$tmp_dir/fake-malformed-message
    printf 'default_tool = codex\n' > "$malformed_dir/.coderail/conf.ini"
    printf 'malformed\n' > "$malformed_dir/malformed.txt"
    git -C "$malformed_dir" add .coderail/conf.ini malformed.txt
    write_fake_commit_agent "$malformed_fake_dir"

    FAKE_COMMIT_OUTPUT='Summary: Malformed message

Commit:

Command:
git commit -m ignored' \
        run_finish_with_fake_agent "$malformed_dir" "$malformed_fake_dir" 'y
'

    assert_failure
    assert_contains "$run_stderr" 'automatic commit failed'
    assert_staged_file_content "$malformed_dir" malformed.txt 'malformed'

    agent_failure_dir=$(create_recorded_work finish-agent-failure)
    agent_failure_fake_dir=$tmp_dir/fake-agent-failure
    printf 'default_tool = codex\n' > "$agent_failure_dir/.coderail/conf.ini"
    printf 'agent failure\n' > "$agent_failure_dir/agent-failure.txt"
    git -C "$agent_failure_dir" add .coderail/conf.ini agent-failure.txt
    write_fake_commit_agent "$agent_failure_fake_dir"

    FAKE_COMMIT_FAIL=true \
    FAKE_COMMIT_OUTPUT='unused' \
        run_finish_with_fake_agent "$agent_failure_dir" "$agent_failure_fake_dir" 'y
'

    assert_failure
    assert_contains "$run_stderr" 'automatic commit failed'
    assert_staged_file_content "$agent_failure_dir" agent-failure.txt 'agent failure'

    git_failure_dir=$(create_recorded_work finish-git-commit-failure)
    git_failure_fake_dir=$tmp_dir/fake-git-commit-failure
    git_dir=$(git -C "$git_failure_dir" rev-parse --absolute-git-dir)
    printf 'default_tool = codex\n' > "$git_failure_dir/.coderail/conf.ini"
    printf 'git failure\n' > "$git_failure_dir/git-failure.txt"
    git -C "$git_failure_dir" add .coderail/conf.ini git-failure.txt
    git -C "$git_failure_dir" commit -q -m 'Prepare integration commit'
    mkdir -p "$git_dir/hooks"
    printf '%s\n' '#!/usr/bin/env sh' 'exit 1' > "$git_dir/hooks/pre-commit"
    chmod 755 "$git_dir/hooks/pre-commit"
    write_fake_commit_agent "$git_failure_fake_dir"

    FAKE_COMMIT_OUTPUT='Summary: Git failure

Commit:
feat(work): fail git commit

Command:
git commit -m ignored' \
        run_finish_with_fake_agent "$git_failure_dir" "$git_failure_fake_dir" 'y
y
'

    assert_failure
    assert_contains "$run_stderr" 'automatic commit failed'
    assert_staged_file_content "$git_failure_dir" git-failure.txt 'git failure'
}

print_tests_header 'Work Command Tests'
test 'Top-level help lists work' assert_top_level_help_lists_work
test 'Work help and dispatch' assert_work_help_and_dispatch
test 'Work rejects invalid arguments' assert_work_rejects_invalid_arguments
test 'Work start requires Git repository' assert_start_requires_git_repository
test 'Work start requires Coderail initialization' assert_start_requires_coderail_initialization
test 'Work start requires clean worktree' assert_start_requires_clean_worktree
test 'Work start requires named branch' assert_start_requires_named_branch
test 'Work start rejects duplicate branch' assert_start_rejects_existing_branch
test 'Work start creates record and cleans inherited workflow' assert_start_creates_work_record_and_removes_inherited_workflow
test 'Work start supports nested work' assert_start_supports_nested_work
test 'Work record validation is strict' assert_work_record_validation
test 'Work finish rejects invalid or mismatched records' assert_finish_rejects_invalid_or_mismatched_records
test 'Work finish rejects untracked or unstaged changes' assert_finish_rejects_untracked_or_unstaged_changes
test 'Work finish returns from a dirty base branch' assert_finish_returns_to_work_branch_when_base_is_dirty
test 'Work finish requires tickets before checkpointing' assert_finish_requires_ticket_readiness_before_checkpoint
test 'Work finish checkpoints and stages code integration' assert_finish_checkpoints_and_stages_code_integration
test 'Work finish restores managed files and permanent config' assert_finish_restores_managed_files_and_permanent_config
test 'Work finish restores parent workflow for nested work' assert_finish_restores_parent_workflow_for_nested_work
test 'Work finish resolves managed conflicts to base' assert_finish_resolves_managed_conflicts_to_base
test 'Work finish recovers code conflicts to work branch' assert_finish_recovers_code_conflicts_to_work_branch
test 'Work finish recovers failed squash merges to work branch' assert_finish_recovers_failed_squash_to_work_branch
test 'Work finish reports a cleaned no-op' assert_finish_reports_noop_after_workflow_cleanup
test 'Work finish cancels automatic commits' assert_finish_cancels_automatic_commit_on_negative_or_eof
test 'Work finish retries and defaults automatic confirmation' assert_finish_retries_and_defaults_automatic_commit_confirmation
test 'Work finish selects or cancels commit tools' assert_finish_selects_or_cancels_commit_tool
test 'Work finish rejects invalid or unavailable configured tools' assert_finish_rejects_invalid_or_unavailable_configured_tool
test 'Work finish commits only parsed agent messages' assert_finish_commits_only_the_parsed_agent_message
test 'Work finish preserves staged results after commit failures' assert_finish_preserves_staged_result_after_agent_or_commit_failures
print_tests_summary

if some_tests_failed; then
    exit 1
fi
