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
    [ ! -e "$1" ] && [ ! -L "$1" ] ||
        fail "unexpected path: $1"
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

assert_not_contains() {
    if grep -F -- "$2" "$1" >/dev/null; then
        fail "$1 unexpectedly contains: $2"
    fi
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

assert_no_unstaged_changes() {
    git -C "$1" diff --quiet || fail "$1 has unstaged changes"
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

assert_ignored() {
    git -C "$1" check-ignore -q -- "$2" ||
        fail "$2 is not ignored"
}

assert_no_loop_paths_staged() {
    staged_loop_paths=$tmp_dir/staged-loop-paths

    git -C "$1" diff --cached --name-only -- .coderail/loop \
        > "$staged_loop_paths"
    assert_file_empty "$staged_loop_paths"
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
    printf '# user config\n' > "$project_dir/.coderail/config.ini"
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
    HOME="$tmp_dir/empty-home" \
        "$CR" --cwd "$work_dir" "$@" > "$run_stdout" 2> "$run_stderr" < /dev/null
    run_status=$?
    set -e
}

run_cr_from_dir() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    (
        cd "$work_dir"
        HOME="$tmp_dir/empty-home" "$CR" "$@"
    ) > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_cr_from_dir() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    (
        cd "$work_dir"
        "$CR" "$@"
    ) > "$run_stdout" 2> "$run_stderr"
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
    printf '%s' "$input" |
        HOME="$tmp_dir/empty-home" \
            "$CR" --cwd "$work_dir" "$@" > "$run_stdout" 2> "$run_stderr"
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

commit_exchange_file=$(printf '%s\n' "$@" |
    sed -n 's/^Write only the raw commit message to this private exchange file: //p')
[ -n "$commit_exchange_file" ] || {
    echo 'fake commit agent did not receive an exchange file' >&2
    exit 9
}

printf 'exchange=%s\n' "$commit_exchange_file" >> "$FAKE_COMMIT_LOG"

if [ -e "$commit_exchange_file" ] || [ -L "$commit_exchange_file" ]; then
    echo 'fake commit agent received a pre-existing exchange file' >&2
    exit 10
fi

case "${FAKE_COMMIT_ARTIFACT:-write}" in
    write)
        printf '%s' "${FAKE_COMMIT_MESSAGE:?}" > "$commit_exchange_file"
        ;;
    absent)
        ;;
    symlink)
        printf '%s' "${FAKE_COMMIT_MESSAGE:?}" > "$commit_exchange_file.target"
        ln -s "$commit_exchange_file.target" "$commit_exchange_file"
        ;;
    non-regular)
        mkdir "$commit_exchange_file"
        ;;
    named-pipe)
        mkfifo "$commit_exchange_file"
        (
            exec 3<> "$commit_exchange_file"
            printf '%s' "${FAKE_COMMIT_MESSAGE:?}" >&3
            sleep 2
        ) &
        ;;
    unreadable)
        printf '%s' "${FAKE_COMMIT_MESSAGE:?}" > "$commit_exchange_file"
        chmod 000 "$commit_exchange_file"
        ;;
    empty)
        : > "$commit_exchange_file"
        ;;
    oversized)
        printf 'feat: ' > "$commit_exchange_file"
        awk 'BEGIN { for (count = 0; count < 65531; count++) printf "a" }' \
            >> "$commit_exchange_file"
        ;;
    maximum)
        printf 'feat: ' > "$commit_exchange_file"
        awk 'BEGIN { for (count = 0; count < 65530; count++) printf "a" }' \
            >> "$commit_exchange_file"
        ;;
    nul)
        printf 'feat: valid\000body' > "$commit_exchange_file"
        ;;
    carriage-return)
        printf 'feat: valid\rbody' > "$commit_exchange_file"
        ;;
    *)
        echo "unknown fake commit artifact: ${FAKE_COMMIT_ARTIFACT}" >&2
        exit 11
        ;;
esac

if [ -n "${FAKE_COMMIT_STDERR:-}" ]; then
    printf '%s\n' "$FAKE_COMMIT_STDERR" >&2
fi

if [ -n "${FAKE_COMMIT_OUTPUT:-}" ]; then
    printf '%s\n' "$FAKE_COMMIT_OUTPUT"
fi

if [ "${FAKE_COMMIT_FAIL:-false}" = true ]; then
    exit 7
fi

if [ -n "${FAKE_COMMIT_SIGNAL:-}" ]; then
    kill "-$FAKE_COMMIT_SIGNAL" "$PPID"
    exit 0
fi
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
        FAKE_COMMIT_SIGNAL=${FAKE_COMMIT_SIGNAL-} \
        FAKE_COMMIT_LOG=$run_fake_commit_log \
        FAKE_COMMIT_ARTIFACT=${FAKE_COMMIT_ARTIFACT-write} \
        FAKE_COMMIT_MESSAGE=${FAKE_COMMIT_MESSAGE-} \
        FAKE_COMMIT_OUTPUT=${FAKE_COMMIT_OUTPUT-} \
        FAKE_COMMIT_STDERR=${FAKE_COMMIT_STDERR-} \
        TMPDIR=$TEMP_DIR \
        HOME="$tmp_dir/empty-home" \
        PATH="$fake_dir:$PATH" \
        "$CR" --cwd "$work_dir" work finish > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_exchange_artifact_removed() {
    exchange_file=$(sed -n 's/^exchange=//p' "$run_fake_commit_log")

    [ -n "$exchange_file" ] || fail 'fake commit agent did not record exchange file'
    assert_path_missing "$exchange_file"
}

write_loop_diagnostics() {
    work_dir=$1

    mkdir -p "$work_dir/.coderail/loop"
    printf '*\n!.gitignore\n' > "$work_dir/.coderail/loop/.gitignore"
    printf 'sensitive diagnostic\n' \
        > "$work_dir/.coderail/loop/diagnostic.txt"
    git -C "$work_dir" add -f .coderail/loop/.gitignore
    git -C "$work_dir" commit -q -m 'Keep loop diagnostics local'
}

run_finish_with_path() {
    work_dir=$1
    path=$2
    input=$3

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    printf '%s' "$input" |
        HOME="$tmp_dir/empty-home" \
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

    run_cr_from_dir "$work_dir" --help

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
    printf 'protected ignore\n' > "$work_dir/.coderail/.gitignore"
    printf 'protected keep\n' > "$work_dir/.coderail/.gitkeep"
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
    assert_file_content "$work_dir/.coderail/.gitignore" 'protected ignore'
    assert_file_content "$work_dir/.coderail/.gitkeep" 'protected keep'
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

assert_finish_recovers_from_invalid_base_loop_policy() {
    work_dir=$(create_git_project finish-invalid-base-loop-policy)

    mkdir -p "$work_dir/.coderail/loop"
    printf '*\n!.gitignore\n!diagnostic.txt\n' \
        > "$work_dir/.coderail/loop/.gitignore"
    commit_all "$work_dir" 'Add invalid base loop ignore policy'
    base_branch=$(git -C "$work_dir" branch --show-current)
    start_recorded_work "$work_dir"
    write_loop_diagnostics "$work_dir"

    git_dir=$(git -C "$work_dir" rev-parse --absolute-git-dir)
    git_exclude=$git_dir/info/exclude
    expected_git_exclude=$tmp_dir/invalid-base-git-exclude
    base_ignore=$tmp_dir/invalid-base-loop-ignore
    cp "$git_exclude" "$expected_git_exclude"

    run_cr "$work_dir" work finish

    assert_failure
    assert_contains \
        "$run_stderr" \
        'loop ignore policy is invalid on base branch'
    assert_branch "$work_dir" coderail/finish-feature
    assert_file_content \
        "$work_dir/.coderail/loop/diagnostic.txt" \
        'sensitive diagnostic'
    assert_ignored "$work_dir" .coderail/loop/diagnostic.txt
    assert_no_loop_paths_staged "$work_dir"
    git -C "$work_dir" show \
        "$base_branch:.coderail/loop/.gitignore" > "$base_ignore"
    assert_file_content "$base_ignore" '*
!.gitignore
!diagnostic.txt'
    cmp "$expected_git_exclude" "$git_exclude" >/dev/null ||
        fail 'failure cleanup changed the Git exclude policy'
}

assert_finish_preserves_diagnostics_when_invalid_base_recovery_is_interrupted() {
    work_dir=$(create_git_project finish-invalid-base-loop-policy-signal)
    fake_dir=$tmp_dir/fake-invalid-base-loop-policy-signal
    real_git=$(command -v git)

    mkdir -p "$work_dir/.coderail/loop"
    printf '*\n!.gitignore\n!diagnostic.txt\n' \
        > "$work_dir/.coderail/loop/.gitignore"
    commit_all "$work_dir" 'Add invalid base loop ignore policy'
    base_branch=$(git -C "$work_dir" branch --show-current)
    start_recorded_work "$work_dir"
    write_loop_diagnostics "$work_dir"

    mkdir "$fake_dir"
    printf '%s\n' \
        '#!/usr/bin/env sh' \
        '"$FAKE_REAL_GIT" "$@"' \
        'git_status=$?' \
        'if [ "$git_status" -eq 0 ] &&' \
        '    [ "$1" = switch ] &&' \
        '    [ "${3:-}" = "$FAKE_FINISH_SIGNAL_BRANCH" ]; then' \
        '    kill -TERM "$PPID"' \
        'fi' \
        'exit "$git_status"' > "$fake_dir/git"
    chmod 755 "$fake_dir/git"

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr
    set +e
    FAKE_REAL_GIT=$real_git \
    FAKE_FINISH_SIGNAL_BRANCH=$base_branch \
    PATH="$fake_dir:$PATH" \
        "$CR" --cwd "$work_dir" work finish > "$run_stdout" 2> "$run_stderr" < /dev/null
    run_status=$?
    set -e

    [ "$run_status" -eq 143 ] ||
        fail "expected signal status 143, got $run_status"
    assert_branch "$work_dir" coderail/finish-feature
    assert_file_content \
        "$work_dir/.coderail/loop/diagnostic.txt" \
        'sensitive diagnostic'
    assert_ignored "$work_dir" .coderail/loop/diagnostic.txt
    assert_no_loop_paths_staged "$work_dir"
    git -C "$work_dir" show \
        "$base_branch:.coderail/loop/.gitignore" > "$tmp_dir/invalid-base-signal-loop-ignore"
    assert_file_content "$tmp_dir/invalid-base-signal-loop-ignore" '*
!.gitignore
!diagnostic.txt'
}

assert_finish_requires_ticket_readiness_before_checkpoint() {
    work_dir=$(create_recorded_work finish-ticket-readiness)
    ticket_file=$work_dir/.coderail/tickets/active/0001-pending-ticket.md
    write_loop_diagnostics "$work_dir"
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
    assert_file_content \
        "$work_dir/.coderail/loop/diagnostic.txt" \
        'sensitive diagnostic'
    assert_ignored "$work_dir" .coderail/loop/diagnostic.txt
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
    printf 'protected ignore\n' > "$work_dir/.coderail/.gitignore"
    printf 'protected keep\n' > "$work_dir/.coderail/.gitkeep"
    printf '# updated config\n' > "$work_dir/.coderail/config.ini"
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
    assert_staged_file_content "$work_dir" .coderail/.gitignore 'protected ignore'
    assert_staged_file_content "$work_dir" .coderail/.gitkeep 'protected keep'
    assert_staged_file_content "$work_dir" .coderail/config.ini '# updated config'
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
    write_loop_diagnostics "$work_dir"

    run_cr "$work_dir" work finish

    assert_failure
    assert_contains "$run_stderr" 'error: squash integration has conflicts; merge the base branch into the work branch before retrying'
    assert_branch "$work_dir" coderail/finish-feature
    assert_clean_worktree "$work_dir"
    assert_file_content \
        "$work_dir/.coderail/loop/diagnostic.txt" \
        'sensitive diagnostic'
    assert_ignored "$work_dir" .coderail/loop/diagnostic.txt
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
    write_loop_diagnostics "$work_dir"

    run_cr "$work_dir" work finish

    assert_success
    assert_contains "$run_stdout" 'work produced no integration changes'
    assert_branch "$work_dir" "$base_branch"
    assert_no_staged_changes "$work_dir"
    assert_path_missing "$work_dir/.coderail/loop"
}

assert_finish_cancels_automatic_commit_on_negative_or_eof() {
    negative_dir=$(create_recorded_work finish-automatic-negative)
    negative_base=$(git -C "$negative_dir" show coderail/finish-feature:.coderail/work.ini |
        sed -n 's/^base_branch=//p')
    write_loop_diagnostics "$negative_dir"
    printf 'negative\n' > "$negative_dir/negative.txt"
    git -C "$negative_dir" add negative.txt

    run_cr_with_input "$negative_dir" 'n
' work finish

    assert_success
    assert_branch "$negative_dir" "$negative_base"
    assert_staged_file_content "$negative_dir" negative.txt 'negative'
    assert_path_missing "$negative_dir/.coderail/loop"
    assert_no_loop_paths_staged "$negative_dir"

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
    printf 'default_tool = codex\n' > "$default_dir/.coderail/config.ini"
    printf 'default\n' > "$default_dir/default.txt"
    git -C "$default_dir" add .coderail/config.ini default.txt
    write_fake_commit_agent "$fake_dir"

    FAKE_COMMIT_MESSAGE='feat(work): keep staged result' \
    FAKE_COMMIT_OUTPUT='agent prose must remain diagnostic only' \
        run_finish_with_fake_agent "$default_dir" "$fake_dir" '
n
'

    assert_success
    assert_contains "$run_fake_commit_log" 'codex'
    assert_contains "$run_fake_commit_log" '$cr-commit'
    assert_contains \
        "$run_fake_commit_log" \
        'Write only the raw commit message to this private exchange file: '
    assert_exchange_artifact_removed
    assert_not_contains "$run_stdout" 'Select commit tool'
    assert_staged_file_content "$default_dir" default.txt 'default'
}

assert_finish_exchanges_subject_and_multiline_messages_for_all_tools() {
    for commit_tool in codex copilot claude gemini; do
        case "$commit_tool" in
            codex)
                commit_skill_invocation='$cr-commit'
                ;;
            copilot|claude|gemini)
                commit_skill_invocation='/cr-commit'
                ;;
        esac

        for message_kind in subject multiline; do
            work_dir=$(create_recorded_work "finish-$commit_tool-$message_kind")
            fake_dir=$tmp_dir/fake-$commit_tool-$message_kind

            printf 'default_tool = %s\n' "$commit_tool" \
                > "$work_dir/.coderail/config.ini"
            printf '%s %s\n' "$commit_tool" "$message_kind" \
                > "$work_dir/$commit_tool-$message_kind.txt"
            git -C "$work_dir" add .coderail/config.ini \
                "$commit_tool-$message_kind.txt"
            write_fake_commit_agent "$fake_dir"

            case "$message_kind" in
                subject)
                    commit_message="feat($commit_tool): exchange subject"
                    ;;
                multiline)
                    commit_message="fix($commit_tool): preserve body

Keep this body opaque.
Footer: exact bytes"
                    ;;
            esac

            FAKE_COMMIT_MESSAGE="$commit_message" \
            FAKE_COMMIT_OUTPUT='agent stdout must remain diagnostic only' \
            FAKE_COMMIT_STDERR='agent stderr must remain diagnostic only' \
                run_finish_with_fake_agent "$work_dir" "$fake_dir" 'y
y
'

            assert_success
            assert_head_commit_message "$work_dir" "$commit_message"
            assert_contains "$run_fake_commit_log" "$commit_tool"
            assert_contains \
                "$run_fake_commit_log" \
                "$commit_skill_invocation"
            assert_contains \
                "$run_fake_commit_log" \
                'Write only the raw commit message to this private exchange file: '
            assert_not_contains "$run_stdout" 'agent stdout must remain diagnostic only'
            assert_not_contains "$run_stderr" 'agent stderr must remain diagnostic only'
            assert_exchange_artifact_removed
        done
    done
}

assert_finish_accepts_allowed_commit_headers_and_maximum_message() {
    header_index=0

    for commit_message in \
        'feat: add behavior' \
        'fix(scope): correct behavior' \
        'refactor(scope)!: change behavior' \
        'docs: explain behavior' \
        'test: cover behavior' \
        'style: format behavior' \
        'chore: maintain behavior'
    do
        header_index=$((header_index + 1))
        work_dir=$(create_recorded_work "finish-valid-header-$header_index")
        fake_dir=$tmp_dir/fake-valid-header-$header_index

        printf 'default_tool = codex\n' > "$work_dir/.coderail/config.ini"
        printf 'valid header\n' > "$work_dir/valid-header.txt"
        git -C "$work_dir" add .coderail/config.ini valid-header.txt
        write_fake_commit_agent "$fake_dir"

        FAKE_COMMIT_MESSAGE="$commit_message" \
            run_finish_with_fake_agent "$work_dir" "$fake_dir" 'y
y
'

        assert_success
        assert_head_commit_message "$work_dir" "$commit_message"
        assert_exchange_artifact_removed
    done

    maximum_dir=$(create_recorded_work finish-maximum-message)
    maximum_fake_dir=$tmp_dir/fake-maximum-message
    printf 'default_tool = codex\n' > "$maximum_dir/.coderail/config.ini"
    printf 'maximum message\n' > "$maximum_dir/maximum-message.txt"
    git -C "$maximum_dir" add .coderail/config.ini maximum-message.txt
    write_fake_commit_agent "$maximum_fake_dir"

    FAKE_COMMIT_ARTIFACT=maximum \
        run_finish_with_fake_agent "$maximum_dir" "$maximum_fake_dir" 'y
y
'

    assert_success
    maximum_subject_size=$(git -C "$maximum_dir" log -1 --format=%s | wc -c)
    [ "$maximum_subject_size" -eq 65537 ] ||
        fail "expected 65536-byte maximum subject, got $maximum_subject_size"
    assert_exchange_artifact_removed
}

assert_finish_rejects_invalid_commit_message_artifacts() {
    for artifact_mode in \
        absent \
        symlink \
        non-regular \
        named-pipe \
        unreadable \
        empty \
        oversized \
        nul \
        carriage-return
    do
        work_dir=$(create_recorded_work "finish-invalid-$artifact_mode")
        fake_dir=$tmp_dir/fake-invalid-$artifact_mode

        printf 'default_tool = codex\n' > "$work_dir/.coderail/config.ini"
        printf 'invalid %s\n' "$artifact_mode" \
            > "$work_dir/invalid-$artifact_mode.txt"
        git -C "$work_dir" add .coderail/config.ini \
            "invalid-$artifact_mode.txt"
        write_fake_commit_agent "$fake_dir"

        FAKE_COMMIT_ARTIFACT=$artifact_mode \
        FAKE_COMMIT_MESSAGE='feat: valid artifact content' \
        FAKE_COMMIT_OUTPUT='agent stdout must not become a message' \
        FAKE_COMMIT_STDERR='agent stderr must not become a message' \
            run_finish_with_fake_agent "$work_dir" "$fake_dir" 'y
'

        assert_failure
        assert_contains \
            "$run_stderr" \
            'automatic commit failed: invalid commit-message exchange artifact'
        assert_not_contains "$run_stdout" 'Proposed commit message:'
        assert_not_contains "$run_stdout" 'agent stdout must not become a message'
        assert_not_contains "$run_stderr" 'agent stderr must not become a message'
        assert_staged_file_content \
            "$work_dir" \
            "invalid-$artifact_mode.txt" \
            "invalid $artifact_mode"
        [ "$(git -C "$work_dir" log -1 --format=%s)" = 'Initial project' ] ||
            fail 'invalid exchange artifact created an integration commit'
        assert_exchange_artifact_removed
    done

    malformed_dir=$(create_recorded_work finish-invalid-malformed-header)
    malformed_fake_dir=$tmp_dir/fake-invalid-malformed-header
    printf 'default_tool = codex\n' > "$malformed_dir/.coderail/config.ini"
    printf 'invalid malformed header\n' > "$malformed_dir/invalid-malformed-header.txt"
    git -C "$malformed_dir" add .coderail/config.ini invalid-malformed-header.txt
    write_fake_commit_agent "$malformed_fake_dir"

    FAKE_COMMIT_MESSAGE='unsupported(scope): malformed header' \
    FAKE_COMMIT_OUTPUT='agent stdout must not become a message' \
        run_finish_with_fake_agent "$malformed_dir" "$malformed_fake_dir" 'y
'

    assert_failure
    assert_contains \
        "$run_stderr" \
        'automatic commit failed: invalid commit-message exchange artifact'
    assert_not_contains "$run_stdout" 'Proposed commit message:'
    assert_exchange_artifact_removed
}

assert_finish_starts_exchange_files_absent_and_never_reuses_stale_artifacts() {
    failed_dir=$(create_recorded_work finish-stale-artifact)
    failed_fake_dir=$tmp_dir/fake-stale-artifact
    printf 'default_tool = codex\n' > "$failed_dir/.coderail/config.ini"
    printf 'stale artifact\n' > "$failed_dir/stale-artifact.txt"
    git -C "$failed_dir" add .coderail/config.ini stale-artifact.txt
    write_fake_commit_agent "$failed_fake_dir"

    FAKE_COMMIT_ARTIFACT=empty \
        run_finish_with_fake_agent "$failed_dir" "$failed_fake_dir" 'y
'

    assert_failure
    stale_exchange_file=$(sed -n 's/^exchange=//p' "$run_fake_commit_log")
    assert_exchange_artifact_removed

    fresh_dir=$(create_recorded_work finish-fresh-artifact)
    fresh_fake_dir=$tmp_dir/fake-fresh-artifact
    printf 'default_tool = codex\n' > "$fresh_dir/.coderail/config.ini"
    printf 'fresh artifact\n' > "$fresh_dir/fresh-artifact.txt"
    git -C "$fresh_dir" add .coderail/config.ini fresh-artifact.txt
    write_fake_commit_agent "$fresh_fake_dir"

    FAKE_COMMIT_MESSAGE='chore: use fresh exchange artifact' \
        run_finish_with_fake_agent "$fresh_dir" "$fresh_fake_dir" 'y
y
'

    assert_success
    fresh_exchange_file=$(sed -n 's/^exchange=//p' "$run_fake_commit_log")
    [ "$stale_exchange_file" != "$fresh_exchange_file" ] ||
        fail 'automatic commit reused an exchange file'
    assert_exchange_artifact_removed
}

assert_finish_selects_or_cancels_commit_tool() {
    selected_dir=$(create_recorded_work finish-selected-tool)
    selected_fake_dir=$tmp_dir/fake-selected-tool
    printf 'selected\n' > "$selected_dir/selected.txt"
    git -C "$selected_dir" add selected.txt
    write_fake_commit_agent "$selected_fake_dir"

    FAKE_COMMIT_MESSAGE='feat(work): select commit tool' \
    FAKE_COMMIT_OUTPUT='agent prose must remain diagnostic only' \
        run_finish_with_fake_agent "$selected_dir" "$selected_fake_dir" 'y
claude
n
'

    assert_success
    assert_contains "$run_stdout" 'Select commit tool (codex, copilot, claude, gemini): '
    assert_contains "$run_fake_commit_log" 'claude'
    assert_contains "$run_fake_commit_log" '/cr-commit'
    assert_contains \
        "$run_fake_commit_log" \
        'Write only the raw commit message to this private exchange file: '
    assert_exchange_artifact_removed
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
    printf 'default_tool = unknown\n' > "$invalid_dir/.coderail/config.ini"
    printf 'invalid\n' > "$invalid_dir/invalid.txt"
    git -C "$invalid_dir" add .coderail/config.ini invalid.txt

    run_cr_with_input "$invalid_dir" 'y
' work finish

    assert_failure
    assert_contains "$run_stderr" 'invalid value for default_tool: unknown'
    assert_staged_file_content "$invalid_dir" invalid.txt 'invalid'

    unavailable_dir=$(create_recorded_work finish-unavailable-default-tool)
    printf 'default_tool = codex\n' > "$unavailable_dir/.coderail/config.ini"
    printf 'unavailable\n' > "$unavailable_dir/unavailable.txt"
    git -C "$unavailable_dir" add .coderail/config.ini unavailable.txt

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

assert_finish_commits_only_the_private_agent_message() {
    work_dir=$(create_recorded_work finish-agent-commit)
    fake_dir=$tmp_dir/fake-agent-commit
    command_marker=$work_dir/agent-command-ran
    write_loop_diagnostics "$work_dir"
    printf 'default_tool = codex\n' > "$work_dir/.coderail/config.ini"
    printf 'committed\n' > "$work_dir/committed.txt"
    git -C "$work_dir" add .coderail/config.ini committed.txt
    write_fake_commit_agent "$fake_dir"

    FAKE_COMMIT_MESSAGE='feat(work): integrate feature

Explain the integrated change.' \
    FAKE_COMMIT_OUTPUT="Commit:
feat(agent): agent prose must not be parsed

Command:
touch $command_marker" \
    FAKE_COMMIT_STDERR='agent stderr must remain diagnostic only' \
        run_finish_with_fake_agent "$work_dir" "$fake_dir" 'y
maybe

'

    assert_success
    assert_contains "$run_stdout" 'Please answer yes or no.'
    assert_head_commit_message "$work_dir" 'feat(work): integrate feature

Explain the integrated change.'
    assert_no_staged_changes "$work_dir"
    assert_path_missing "$command_marker"
    assert_not_contains "$run_stdout" 'agent prose must not be parsed'
    assert_not_contains "$run_stderr" 'agent stderr must remain diagnostic only'
    assert_exchange_artifact_removed
    assert_path_missing "$work_dir/.coderail/loop"
    if git -C "$work_dir" rev-list --all --objects -- \
        .coderail/loop/diagnostic.txt | grep . >/dev/null
    then
        fail 'loop diagnostic entered Git history'
    fi
}

assert_finish_preserves_staged_result_after_agent_or_commit_failures() {
    declined_dir=$(create_recorded_work finish-message-declined)
    declined_fake_dir=$tmp_dir/fake-message-declined
    write_loop_diagnostics "$declined_dir"
    printf 'default_tool = codex\n' > "$declined_dir/.coderail/config.ini"
    printf 'declined\n' > "$declined_dir/declined.txt"
    git -C "$declined_dir" add .coderail/config.ini declined.txt
    write_fake_commit_agent "$declined_fake_dir"

    FAKE_COMMIT_MESSAGE='feat(work): decline message' \
    FAKE_COMMIT_OUTPUT='agent prose must remain diagnostic only' \
        run_finish_with_fake_agent "$declined_dir" "$declined_fake_dir" 'y
n
'

    assert_success
    assert_staged_file_content "$declined_dir" declined.txt 'declined'
    assert_path_missing "$declined_dir/.coderail/loop"
    assert_no_loop_paths_staged "$declined_dir"
    assert_exchange_artifact_removed

    message_eof_dir=$(create_recorded_work finish-message-eof)
    message_eof_fake_dir=$tmp_dir/fake-message-eof
    printf 'default_tool = codex\n' > "$message_eof_dir/.coderail/config.ini"
    printf 'message eof\n' > "$message_eof_dir/message-eof.txt"
    git -C "$message_eof_dir" add .coderail/config.ini message-eof.txt
    write_fake_commit_agent "$message_eof_fake_dir"

    FAKE_COMMIT_MESSAGE='feat(work): cancel message approval' \
    FAKE_COMMIT_OUTPUT='agent prose must remain diagnostic only' \
        run_finish_with_fake_agent "$message_eof_dir" "$message_eof_fake_dir" 'y
'

    assert_success
    assert_staged_file_content "$message_eof_dir" message-eof.txt 'message eof'
    assert_exchange_artifact_removed

    malformed_dir=$(create_recorded_work finish-malformed-message)
    malformed_fake_dir=$tmp_dir/fake-malformed-message
    printf 'default_tool = codex\n' > "$malformed_dir/.coderail/config.ini"
    printf 'malformed\n' > "$malformed_dir/malformed.txt"
    git -C "$malformed_dir" add .coderail/config.ini malformed.txt
    write_fake_commit_agent "$malformed_fake_dir"

    FAKE_COMMIT_MESSAGE='invalid header' \
    FAKE_COMMIT_OUTPUT='agent prose must remain diagnostic only' \
        run_finish_with_fake_agent "$malformed_dir" "$malformed_fake_dir" 'y
'

    assert_failure
    assert_contains "$run_stderr" 'automatic commit failed'
    assert_staged_file_content "$malformed_dir" malformed.txt 'malformed'
    assert_exchange_artifact_removed

    agent_failure_dir=$(create_recorded_work finish-agent-failure)
    agent_failure_fake_dir=$tmp_dir/fake-agent-failure
    write_loop_diagnostics "$agent_failure_dir"
    printf 'default_tool = codex\n' > "$agent_failure_dir/.coderail/config.ini"
    printf 'agent failure\n' > "$agent_failure_dir/agent-failure.txt"
    git -C "$agent_failure_dir" add .coderail/config.ini agent-failure.txt
    write_fake_commit_agent "$agent_failure_fake_dir"

    FAKE_COMMIT_FAIL=true \
    FAKE_COMMIT_MESSAGE='feat(work): agent failure' \
    FAKE_COMMIT_OUTPUT='agent prose must remain diagnostic only' \
        run_finish_with_fake_agent "$agent_failure_dir" "$agent_failure_fake_dir" 'y
'

    assert_failure
    assert_contains "$run_stderr" 'automatic commit failed'
    assert_staged_file_content "$agent_failure_dir" agent-failure.txt 'agent failure'
    assert_file_content \
        "$agent_failure_dir/.coderail/loop/diagnostic.txt" \
        'sensitive diagnostic'
    assert_ignored "$agent_failure_dir" .coderail/loop/diagnostic.txt
    assert_no_loop_paths_staged "$agent_failure_dir"
    assert_exchange_artifact_removed

    git_failure_dir=$(create_recorded_work finish-git-commit-failure)
    git_failure_fake_dir=$tmp_dir/fake-git-commit-failure
    git_dir=$(git -C "$git_failure_dir" rev-parse --absolute-git-dir)
    write_loop_diagnostics "$git_failure_dir"
    printf 'default_tool = codex\n' > "$git_failure_dir/.coderail/config.ini"
    printf 'git failure\n' > "$git_failure_dir/git-failure.txt"
    git -C "$git_failure_dir" add .coderail/config.ini git-failure.txt
    git -C "$git_failure_dir" commit -q -m 'Prepare integration commit'
    mkdir -p "$git_dir/hooks"
    printf '%s\n' '#!/usr/bin/env sh' 'exit 1' > "$git_dir/hooks/pre-commit"
    chmod 755 "$git_dir/hooks/pre-commit"
    write_fake_commit_agent "$git_failure_fake_dir"

    FAKE_COMMIT_MESSAGE='feat(work): fail git commit' \
    FAKE_COMMIT_OUTPUT='agent prose must remain diagnostic only' \
        run_finish_with_fake_agent "$git_failure_dir" "$git_failure_fake_dir" 'y
y
'

    assert_failure
    assert_contains "$run_stderr" 'automatic commit failed'
    assert_staged_file_content "$git_failure_dir" git-failure.txt 'git failure'
    assert_file_content \
        "$git_failure_dir/.coderail/loop/diagnostic.txt" \
        'sensitive diagnostic'
    assert_ignored "$git_failure_dir" .coderail/loop/diagnostic.txt
    assert_no_loop_paths_staged "$git_failure_dir"
    assert_exchange_artifact_removed
}

assert_finish_preserves_loop_diagnostics_after_signal() {
    work_dir=$(create_recorded_work finish-signal)
    fake_dir=$tmp_dir/fake-signal
    git_dir=$(git -C "$work_dir" rev-parse --absolute-git-dir)
    git_exclude=$git_dir/info/exclude
    expected_git_exclude=$tmp_dir/signal-git-exclude

    write_loop_diagnostics "$work_dir"
    cp "$git_exclude" "$expected_git_exclude"
    printf 'default_tool = codex\n' > "$work_dir/.coderail/config.ini"
    printf 'signal\n' > "$work_dir/signal.txt"
    git -C "$work_dir" add .coderail/config.ini signal.txt
    write_fake_commit_agent "$fake_dir"

    FAKE_COMMIT_SIGNAL=TERM \
    FAKE_COMMIT_MESSAGE='feat(work): signal finish' \
    FAKE_COMMIT_OUTPUT=unused \
        run_finish_with_fake_agent "$work_dir" "$fake_dir" 'y
'

    [ "$run_status" -eq 143 ] ||
        fail "expected signal status 143, got $run_status"
    assert_file_content \
        "$work_dir/.coderail/loop/diagnostic.txt" \
        'sensitive diagnostic'
    assert_ignored "$work_dir" .coderail/loop/diagnostic.txt
    assert_no_loop_paths_staged "$work_dir"
    assert_exchange_artifact_removed
    cmp "$expected_git_exclude" "$git_exclude" >/dev/null ||
        fail 'signal cleanup changed the Git exclude policy'
}

assert_finish_loop_cleanup_preserves_unrelated_placeholders() {
    work_dir=$(create_recorded_work finish-loop-cleanup-boundary)
    git_dir=$(git -C "$work_dir" rev-parse --absolute-git-dir)
    git_exclude=$git_dir/info/exclude
    expected_git_exclude=$tmp_dir/success-git-exclude

    write_loop_diagnostics "$work_dir"
    cp "$git_exclude" "$expected_git_exclude"
    printf 'protected ignore\n' > "$work_dir/.coderail/.gitignore"
    printf 'protected keep\n' > "$work_dir/.coderail/.gitkeep"
    printf 'boundary\n' > "$work_dir/boundary.txt"
    git -C "$work_dir" add \
        .coderail/.gitignore \
        .coderail/.gitkeep \
        boundary.txt

    run_cr_with_input "$work_dir" 'n
' work finish

    assert_success
    assert_path_missing "$work_dir/.coderail/loop"
    assert_file_content \
        "$work_dir/.coderail/.gitignore" \
        'protected ignore'
    assert_file_content \
        "$work_dir/.coderail/.gitkeep" \
        'protected keep'
    assert_no_loop_paths_staged "$work_dir"
    cmp "$expected_git_exclude" "$git_exclude" >/dev/null ||
        fail 'successful cleanup changed the Git exclude policy'
}

assert_finish_stages_removal_of_base_loop_ignore() {
    work_dir=$(create_git_project finish-base-loop-ignore)

    mkdir -p "$work_dir/.coderail/loop"
    printf '*\n!.gitignore\n' > "$work_dir/.coderail/loop/.gitignore"
    commit_all "$work_dir" 'Add loop ignore policy'
    start_recorded_work "$work_dir"
    printf 'sensitive diagnostic\n' \
        > "$work_dir/.coderail/loop/diagnostic.txt"

    run_cr_with_input "$work_dir" 'n
' work finish

    assert_success
    assert_path_missing "$work_dir/.coderail/loop"
    assert_no_unstaged_changes "$work_dir"
    staged_change=$(git -C "$work_dir" diff --cached --name-status)
    [ "$staged_change" = "D	.coderail/loop/.gitignore" ] ||
        fail "unexpected staged change: $staged_change"
}

assert_finish_removes_base_loop_ignore_after_staged_work_deletion() {
    work_dir=$(create_git_project finish-staged-loop-deletion)

    mkdir -p "$work_dir/.coderail/loop"
    printf '*\n!.gitignore\n' > "$work_dir/.coderail/loop/.gitignore"
    commit_all "$work_dir" 'Add loop ignore policy'
    start_recorded_work "$work_dir"
    rm -rf "$work_dir/.coderail/loop"
    git -C "$work_dir" add -u .coderail/loop

    run_cr_with_input "$work_dir" 'n
' work finish

    assert_success
    assert_path_missing "$work_dir/.coderail/loop"
    assert_no_unstaged_changes "$work_dir"
    staged_change=$(git -C "$work_dir" diff --cached --name-status)
    [ "$staged_change" = "D	.coderail/loop/.gitignore" ] ||
        fail "unexpected staged change: $staged_change"
}

assert_finish_skips_loop_ignore_bridge_for_valid_base_policy() {
    work_dir=$(create_git_project finish-valid-base-loop-policy)

    mkdir -p "$work_dir/.coderail/loop"
    printf '*\n!.gitignore\n' > "$work_dir/.coderail/loop/.gitignore"
    commit_all "$work_dir" 'Add loop ignore policy'
    start_recorded_work "$work_dir"
    printf 'sensitive diagnostic\n' \
        > "$work_dir/.coderail/loop/diagnostic.txt"

    git_dir=$(git -C "$work_dir" rev-parse --absolute-git-dir)
    git_exclude=$git_dir/info/exclude
    git_exclude_target=$tmp_dir/valid-base-git-exclude
    rm "$git_exclude"
    printf 'user exclude\n' > "$git_exclude_target"
    ln -s "$git_exclude_target" "$git_exclude"

    run_cr_with_input "$work_dir" 'n
' work finish

    assert_success
    assert_path_missing "$work_dir/.coderail/loop"
    [ -L "$git_exclude" ] || fail 'Git exclude symlink was removed'
    assert_file_content "$git_exclude_target" 'user exclude'
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
test 'Work finish recovers from an invalid base loop policy' assert_finish_recovers_from_invalid_base_loop_policy
test 'Work finish preserves diagnostics after interrupted invalid-base recovery' assert_finish_preserves_diagnostics_when_invalid_base_recovery_is_interrupted
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
test 'Work finish exchanges subject and multiline messages for all tools' assert_finish_exchanges_subject_and_multiline_messages_for_all_tools
test 'Work finish accepts allowed headers and maximum messages' assert_finish_accepts_allowed_commit_headers_and_maximum_message
test 'Work finish rejects invalid commit-message artifacts' assert_finish_rejects_invalid_commit_message_artifacts
test 'Work finish starts exchange files absent and never reuses stale artifacts' assert_finish_starts_exchange_files_absent_and_never_reuses_stale_artifacts
test 'Work finish selects or cancels commit tools' assert_finish_selects_or_cancels_commit_tool
test 'Work finish rejects invalid or unavailable configured tools' assert_finish_rejects_invalid_or_unavailable_configured_tool
test 'Work finish commits only private agent messages' assert_finish_commits_only_the_private_agent_message
test 'Work finish preserves staged results after commit failures' assert_finish_preserves_staged_result_after_agent_or_commit_failures
test 'Work finish preserves loop diagnostics after signals' assert_finish_preserves_loop_diagnostics_after_signal
test 'Work finish loop cleanup preserves unrelated placeholders' assert_finish_loop_cleanup_preserves_unrelated_placeholders
test 'Work finish stages removal of a base loop ignore' assert_finish_stages_removal_of_base_loop_ignore
test 'Work finish removes base loop ignore after staged work deletion' assert_finish_removes_base_loop_ignore_after_staged_work_deletion
test 'Work finish skips loop bridge for a valid base policy' assert_finish_skips_loop_ignore_bridge_for_valid_base_policy
print_tests_summary

if some_tests_failed; then
    exit 1
fi
