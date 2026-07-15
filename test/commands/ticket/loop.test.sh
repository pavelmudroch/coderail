#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../../.."
    pwd
)

CR=$ROOT_DIR/bin/cr
TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-loop-test.XXXXXX")

. "$ROOT_DIR/test/suite.sh"

cleanup() {
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

assert_no_path() {
    [ ! -e "$1" ] || fail "unexpected path: $1"
}

assert_dir() {
    [ -d "$1" ] || fail "missing directory: $1"
}

assert_file_empty() {
    [ ! -s "$1" ] || fail "$1 should be empty"
}

assert_contains() {
    grep -F -- "$2" "$1" >/dev/null || fail "$1 does not contain: $2"
}

assert_not_contains() {
    ! grep -F -- "$2" "$1" >/dev/null || fail "$1 should not contain: $2"
}

assert_file_content() {
    file=$1
    expected=$2
    expected_file=$tmp_dir/expected-content

    assert_file "$file"
    printf '%s\n' "$expected" > "$expected_file"
    cmp "$expected_file" "$file" >/dev/null || fail "$file content differs"
}

assert_line_count() {
    file=$1
    expected_count=$2
    actual_count=$(wc -l < "$file" | tr -d ' ')

    [ "$actual_count" -eq "$expected_count" ] ||
        fail "$file line count differs: expected $expected_count, got $actual_count"
}

assert_no_unstaged_or_untracked_changes() {
    work_dir=$1
    status_file=$tmp_dir/git-status

    git -C "$work_dir" status --porcelain > "$status_file"

    if awk '
        $0 == "" { next }
        substr($0, 1, 2) == "??" { found = 1 }
        substr($0, 2, 1) != " " { found = 1 }
        END { exit found ? 0 : 1 }
    ' "$status_file"; then
        fail "$work_dir has unstaged or untracked changes"
    fi
}

assert_no_staged_changes() {
    work_dir=$1

    git -C "$work_dir" diff --cached --quiet ||
        fail "$work_dir has staged changes"
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

create_project() {
    project_dir=$tmp_dir/$1

    mkdir -p "$project_dir/.coderail/tickets/open"
    mkdir -p "$project_dir/.coderail/tickets/active"
    mkdir -p "$project_dir/.coderail/tickets/closed"

    git init -q "$project_dir"
    (
        cd "$project_dir"
        git config user.email "test@example.com"
        git config user.name "CodeRail Test"
        git commit --allow-empty -q -m "Initial project"
    )

    printf '%s\n' "$project_dir"
}

write_ticket() {
    ticket_file=$1
    ticket_id=$2
    ticket_slug=$3
    ticket_title=$4
    ticket_status=$5
    ticket_dependencies=$6
    ticket_extra=$7

    mkdir -p "$(dirname "$ticket_file")"
    cat > "$ticket_file" <<EOF
---
id: $ticket_id
slug: $ticket_slug
title: $ticket_title
status: $ticket_status
created_at: 2024-06-01T12:00:00Z
updated_at: 2024-06-01T12:00:00Z
dependencies: $ticket_dependencies
$ticket_extra---

# $ticket_title
EOF
}

commit_all() {
    work_dir=$1
    message=$2

    git -C "$work_dir" add .
    git -C "$work_dir" commit -q -m "$message"
}

create_home() {
    home_dir=$tmp_dir/home-$1

    mkdir -p "$home_dir"

    printf '%s\n' "$home_dir"
}

write_user_config() {
    home_dir=$1
    shift

    mkdir -p "$home_dir/.coderail"
    printf '%s\n' "$@" > "$home_dir/.coderail/config.ini"
}

write_repo_config() {
    work_dir=$1
    shift

    mkdir -p "$work_dir/.coderail"
    printf '%s\n' "$@" > "$work_dir/.coderail/conf.ini"
    git -C "$work_dir" add .coderail/conf.ini
    git -C "$work_dir" commit -q -m "Set repo config"
}

write_fake_agent() {
    fake_dir=$1

    mkdir -p "$fake_dir"
    cat > "$fake_dir/fake-agent" <<'EOF'
#!/usr/bin/env sh
set -eu

[ "$#" -eq 1 ] || {
    echo "fake agent expected 1 prompt" >&2
    exit 64
}

prompt=$1
case "$prompt" in
    '$ticket-implement "'*'"')
        ticket_reference=${prompt#'$ticket-implement "'}
        ticket_reference=${ticket_reference%'"'}
        ;;
    '/ticket-implement "'*'"')
        ticket_reference=${prompt#'/ticket-implement "'}
        ticket_reference=${ticket_reference%'"'}
        ;;
    *)
        echo "fake agent expected ticket-implement prompt" >&2
        exit 65
        ;;
esac

[ -n "$ticket_reference" ] || {
    echo "fake agent expected ticket path" >&2
    exit 65
}

: "${CODERAIL_BIN_PATH:?}"
: "${FAKE_AGENT_COUNT_FILE:?}"
: "${FAKE_AGENT_LOG:?}"

count=0
if [ -f "$FAKE_AGENT_COUNT_FILE" ]; then
    count=$(cat "$FAKE_AGENT_COUNT_FILE")
fi
count=$((count + 1))
printf '%s\n' "$count" > "$FAKE_AGENT_COUNT_FILE"

printf '%s\n' "$prompt" >> "$FAKE_AGENT_LOG"

if [ -n "${FAKE_AGENT_STDOUT:-}" ]; then
    printf '%s\n' "$FAKE_AGENT_STDOUT"
fi

if [ -n "${FAKE_AGENT_STDERR:-}" ]; then
    printf '%s\n' "$FAKE_AGENT_STDERR" >&2
fi

if [ "${FAKE_AGENT_FAIL_ON:-}" = "$count" ]; then
    printf 'failed %s\n' "$ticket_reference" > "work-$count.txt"
    echo "fake agent failure" >&2
    exit 7
fi

printf 'implemented %s\n' "$ticket_reference" > "work-$count.txt"

close_reason=${FAKE_AGENT_CLOSE_REASON:-done}
case "$close_reason" in
    open)
        ;;
    active)
        "$CODERAIL_BIN_PATH" ticket activate "$ticket_reference" >/dev/null
        ;;
    duplicate)
        activated_ticket=$("$CODERAIL_BIN_PATH" ticket activate "$ticket_reference")
        "$CODERAIL_BIN_PATH" ticket close \
            --reason duplicate \
            --duplicate-of "$FAKE_AGENT_DUPLICATE_OF" \
            "$activated_ticket"
        ;;
    done|deferred|dismissed)
        activated_ticket=$("$CODERAIL_BIN_PATH" ticket activate "$ticket_reference")
        "$CODERAIL_BIN_PATH" ticket close --reason "$close_reason" "$activated_ticket"
        ;;
    *)
        echo "unknown fake close reason: $close_reason" >&2
        exit 66
        ;;
esac
EOF
    chmod +x "$fake_dir/fake-agent"

    cat > "$fake_dir/codex" <<'EOF'
#!/usr/bin/env sh
set -eu

[ "$#" -eq 2 ] || {
    echo "fake codex expected 2 arguments" >&2
    exit 64
}
[ "$1" = exec ] || {
    echo "fake codex expected exec command" >&2
    exit 65
}

exec "$(dirname "$0")/fake-agent" "$2"
EOF
    chmod +x "$fake_dir/codex"

    for fake_tool in claude gemini copilot; do
        cat > "$fake_dir/$fake_tool" <<'EOF'
#!/usr/bin/env sh
set -eu

[ "$#" -eq 2 ] || {
    echo "fake prompt agent expected 2 arguments" >&2
    exit 64
}
[ "$1" = -p ] || {
    echo "fake prompt agent expected -p command" >&2
    exit 65
}

exec "$(dirname "$0")/fake-agent" "$2"
EOF
        chmod +x "$fake_dir/$fake_tool"
    done
}

write_git_add_dirty_wrapper() {
    fake_dir=$1

    mkdir -p "$fake_dir"
    cat > "$fake_dir/git" <<'EOF'
#!/usr/bin/env sh
set -eu

if [ "$#" -ge 2 ] && [ "$1" = add ] && [ "$2" = --all ]; then
    "$REAL_GIT" "$@"
    status=$?

    if [ "$status" -eq 0 ] && [ ! -e .git/coderail-loop-dirty-created ]; then
        : > .git/coderail-loop-dirty-created
        printf '%s\n' dirty > handoff-dirty.txt
    fi

    exit "$status"
fi

exec "$REAL_GIT" "$@"
EOF
    chmod +x "$fake_dir/git"
}

run_loop() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" ticket loop "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_loop_with_fake() {
    work_dir=$1
    fake_dir=$2
    shift 2

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr
    run_fake_agent_log=$fake_dir/agent.log
    run_fake_agent_count=$fake_dir/agent.count
    real_git=$(command -v git)

    : > "$run_fake_agent_log"
    rm -f "$run_fake_agent_count"

    set +e
    CODERAIL_BIN_PATH=$CR \
    FAKE_AGENT_CLOSE_REASON=${FAKE_AGENT_CLOSE_REASON-} \
    FAKE_AGENT_COUNT_FILE=$run_fake_agent_count \
    FAKE_AGENT_DUPLICATE_OF=${FAKE_AGENT_DUPLICATE_OF-} \
    FAKE_AGENT_FAIL_ON=${FAKE_AGENT_FAIL_ON-} \
    FAKE_AGENT_LOG=$run_fake_agent_log \
    FAKE_AGENT_STDERR=${FAKE_AGENT_STDERR-} \
    FAKE_AGENT_STDOUT=${FAKE_AGENT_STDOUT-} \
    PATH="$fake_dir:$PATH" \
    REAL_GIT=$real_git \
        "$CR" --cwd "$work_dir" ticket loop "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_quiet_loop_with_fake() {
    work_dir=$1
    fake_dir=$2
    shift 2

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr
    run_fake_agent_log=$fake_dir/agent.log
    run_fake_agent_count=$fake_dir/agent.count
    real_git=$(command -v git)

    : > "$run_fake_agent_log"
    rm -f "$run_fake_agent_count"

    set +e
    CODERAIL_BIN_PATH=$CR \
    FAKE_AGENT_CLOSE_REASON=${FAKE_AGENT_CLOSE_REASON-} \
    FAKE_AGENT_COUNT_FILE=$run_fake_agent_count \
    FAKE_AGENT_DUPLICATE_OF=${FAKE_AGENT_DUPLICATE_OF-} \
    FAKE_AGENT_FAIL_ON=${FAKE_AGENT_FAIL_ON-} \
    FAKE_AGENT_LOG=$run_fake_agent_log \
    FAKE_AGENT_STDERR=${FAKE_AGENT_STDERR-} \
    FAKE_AGENT_STDOUT=${FAKE_AGENT_STDOUT-} \
    PATH="$fake_dir:$PATH" \
    REAL_GIT=$real_git \
        "$CR" --quiet --cwd "$work_dir" ticket loop "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_loop_with_home() {
    work_dir=$1
    home_dir=$2
    shift 2

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    HOME=$home_dir "$CR" --cwd "$work_dir" ticket loop "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_verbose_loop() {
    work_dir=$1
    shift

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    "$CR" --cwd "$work_dir" --verbose ticket loop "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_verbose_loop_with_home() {
    work_dir=$1
    home_dir=$2
    shift 2

    run_stdout=$tmp_dir/run.stdout
    run_stderr=$tmp_dir/run.stderr

    set +e
    HOME=$home_dir "$CR" --cwd "$work_dir" --verbose ticket loop "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

assert_loop_short_help() {
    work_dir=$(create_project short-help)

    run_loop "$work_dir" -h

    assert_success
    assert_contains "$run_stdout" "Usage:"
    assert_contains "$run_stdout" "cr ticket loop"
    assert_contains "$run_stdout" "--output-dir <directory>"
    assert_contains "$run_stdout" "--progress-only"
    assert_file_empty "$run_stderr"
}

assert_loop_long_help() {
    work_dir=$(create_project long-help)

    run_loop "$work_dir" --help

    assert_success
    assert_contains "$run_stdout" "Usage:"
    assert_contains "$run_stdout" "cr ticket loop"
    assert_contains "$run_stdout" "--output-dir <directory>"
    assert_contains "$run_stdout" "--progress-only"
    assert_file_empty "$run_stderr"
}

assert_loop_uses_default_max() {
    work_dir=$(create_project default-max)

    run_verbose_loop "$work_dir" codex

    assert_success
    assert_contains "$run_stdout" "ticket loop max: 5"
    assert_file_empty "$run_stderr"
}

assert_loop_accepts_short_max() {
    work_dir=$(create_project short-max)

    run_verbose_loop "$work_dir" -m 2 codex

    assert_success
    assert_contains "$run_stdout" "ticket loop max: 2"
    assert_file_empty "$run_stderr"
}

assert_loop_accepts_long_max() {
    work_dir=$(create_project long-max)

    run_verbose_loop "$work_dir" --max 3 codex

    assert_success
    assert_contains "$run_stdout" "ticket loop max: 3"
    assert_file_empty "$run_stderr"
}

assert_loop_accepts_all() {
    work_dir=$(create_project all)

    run_verbose_loop "$work_dir" --all codex

    assert_success
    assert_contains "$run_stdout" "ticket loop max: all"
    assert_file_empty "$run_stderr"
}

assert_loop_accepts_output_dir() {
    work_dir=$(create_project output-dir)
    output_dir=$tmp_dir/output-dir-accepted

    run_loop "$work_dir" --output-dir "$output_dir" codex

    assert_success
    assert_file_empty "$run_stdout"
    assert_file_empty "$run_stderr"
}

assert_loop_accepts_output_dir_equals() {
    work_dir=$(create_project output-dir-equals)
    output_dir=$tmp_dir/output-dir-equals-accepted

    run_loop "$work_dir" --output-dir="$output_dir" codex

    assert_success
    assert_file_empty "$run_stdout"
    assert_file_empty "$run_stderr"
}

assert_loop_accepts_progress_only() {
    work_dir=$(create_project progress-only)

    run_loop "$work_dir" --progress-only codex

    assert_success
    assert_file_empty "$run_stdout"
    assert_file_empty "$run_stderr"
}

assert_loop_rejects_repeated_max() {
    work_dir=$(create_project repeated-max)

    run_loop "$work_dir" --max 1 --max 2 codex

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "--max provided multiple times"
}

assert_loop_rejects_repeated_output_dir() {
    work_dir=$(create_project repeated-output-dir)

    run_loop "$work_dir" --output-dir "$tmp_dir/output-dir-a" --output-dir "$tmp_dir/output-dir-b" codex

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "--output-dir provided multiple times"
    assert_contains "$run_stderr" "Usage:"
}

assert_loop_rejects_repeated_progress_only() {
    work_dir=$(create_project repeated-progress-only)

    run_loop "$work_dir" --progress-only --progress-only codex

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "--progress-only provided multiple times"
    assert_contains "$run_stderr" "Usage:"
}

assert_loop_rejects_progress_only_with_output_dir() {
    work_dir=$(create_project progress-only-output-dir)

    run_loop "$work_dir" --progress-only --output-dir "$tmp_dir/progress-only-output-dir" codex

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "--progress-only and --output-dir cannot be used together"
    assert_contains "$run_stderr" "Usage:"
}

assert_loop_rejects_all_with_max() {
    work_dir=$(create_project all-max)

    run_loop "$work_dir" --all --max 2 codex

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "--all and --max cannot be used together"
}

assert_loop_rejects_missing_max_value() {
    work_dir=$(create_project missing-max)

    run_loop "$work_dir" --max

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "--max requires a value"
}

assert_loop_rejects_missing_output_dir_value() {
    work_dir=$(create_project missing-output-dir)

    run_loop "$work_dir" --output-dir

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "--output-dir requires a value"
    assert_contains "$run_stderr" "Usage:"
}

assert_loop_rejects_empty_output_dir_value() {
    work_dir=$(create_project empty-output-dir)

    run_loop "$work_dir" --output-dir "" codex

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "--output-dir requires a non-empty value"
    assert_contains "$run_stderr" "Usage:"
}

assert_loop_rejects_empty_output_dir_equals_value() {
    work_dir=$(create_project empty-output-dir-equals)

    run_loop "$work_dir" --output-dir= codex

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "--output-dir requires a non-empty value"
    assert_contains "$run_stderr" "Usage:"
}

assert_loop_rejects_invalid_max_value() {
    work_dir=$(create_project invalid-max)

    run_loop "$work_dir" -m 0 codex

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "--max must be a positive integer"
}

assert_loop_rejects_unknown_option() {
    work_dir=$(create_project unknown-option)

    run_loop "$work_dir" --unknown codex

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "unknown option: --unknown"
}

assert_loop_rejects_unexpected_argument() {
    work_dir=$(create_project unexpected-argument)

    run_loop "$work_dir" codex extra

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "unexpected argument: extra"
}

assert_loop_accepts_supported_tools() {
    work_dir=$(create_project supported-tools)
    home_dir=$(create_home supported-tools)

    for tool in codex copilot claude gemini; do
        run_verbose_loop_with_home "$work_dir" "$home_dir" "$tool"

        assert_success
        assert_contains "$run_stdout" "ticket loop tool: $tool"
        assert_file_empty "$run_stderr"
    done
}

assert_loop_invokes_supported_tools_noninteractively() {
    for tool in codex copilot claude gemini; do
        work_dir=$(create_project "command-form-$tool")
        fake_dir=$tmp_dir/fake-command-form-$tool
        expected_prompt='/ticket-implement ".coderail/tickets/open/0001-command-form.md"'

        if [ "$tool" = codex ]; then
            expected_prompt='$ticket-implement ".coderail/tickets/open/0001-command-form.md"'
        fi

        write_fake_agent "$fake_dir"
        write_ticket \
            "$work_dir/.coderail/tickets/open/0001-command-form.md" \
            0001 \
            command-form \
            "Command Form" \
            open \
            "" \
            ""
        commit_all "$work_dir" "Add ticket"

        run_loop_with_fake "$work_dir" "$fake_dir" --all "$tool"

        assert_success
        assert_file_content "$run_fake_agent_log" "$expected_prompt"
        assert_file "$work_dir/.coderail/tickets/closed/0001-command-form.md"
    done
}

assert_loop_explicit_tool_wins() {
    work_dir=$(create_project explicit-tool)
    home_dir=$(create_home explicit-tool)

    write_user_config "$home_dir" "default_tool = unknown-user"
    write_repo_config "$work_dir" "default_tool = unknown-repo"

    run_verbose_loop_with_home "$work_dir" "$home_dir" codex

    assert_success
    assert_contains "$run_stdout" "ticket loop tool: codex"
    assert_file_empty "$run_stderr"
}

assert_loop_uses_user_default_tool() {
    work_dir=$(create_project user-default-tool)
    home_dir=$(create_home user-default-tool)

    write_user_config "$home_dir" "default_tool = codex"

    run_verbose_loop_with_home "$work_dir" "$home_dir"

    assert_success
    assert_contains "$run_stdout" "ticket loop tool: codex"
    assert_file_empty "$run_stderr"
}

assert_loop_repo_default_overrides_user_default() {
    work_dir=$(create_project repo-default-tool)
    home_dir=$(create_home repo-default-tool)

    write_user_config "$home_dir" "default_tool = codex"
    write_repo_config "$work_dir" "default_tool = claude"

    run_verbose_loop_with_home "$work_dir" "$home_dir"

    assert_success
    assert_contains "$run_stdout" "ticket loop tool: claude"
    assert_file_empty "$run_stderr"
}

assert_loop_rejects_missing_default_tool() {
    work_dir=$(create_project missing-default-tool)
    home_dir=$(create_home missing-default-tool)

    run_loop_with_home "$work_dir" "$home_dir"

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "missing tool"
}

assert_loop_rejects_unknown_explicit_tool() {
    work_dir=$(create_project unknown-explicit-tool)
    home_dir=$(create_home unknown-explicit-tool)

    run_loop_with_home "$work_dir" "$home_dir" unknown

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "unknown tool: unknown"
}

assert_loop_rejects_unknown_default_tool() {
    work_dir=$(create_project unknown-default-tool)
    home_dir=$(create_home unknown-default-tool)

    write_user_config "$home_dir" "default_tool = unknown"

    run_loop_with_home "$work_dir" "$home_dir"

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "unknown tool: unknown"
}

assert_loop_allows_clean_startup() {
    work_dir=$(create_project clean-startup)

    run_loop "$work_dir" codex

    assert_success
    assert_file_empty "$run_stdout"
    assert_file_empty "$run_stderr"
}

assert_loop_rejects_staged_startup_changes() {
    work_dir=$(create_project staged-startup)

    printf '%s\n' "staged" > "$work_dir/staged.txt"
    git -C "$work_dir" add staged.txt

    run_loop "$work_dir" codex

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "clean git worktree before starting"
    assert_contains "$run_stderr" "staged"
}

assert_loop_rejects_unstaged_startup_changes() {
    work_dir=$(create_project unstaged-startup)

    printf '%s\n' "tracked" > "$work_dir/tracked.txt"
    git -C "$work_dir" add tracked.txt
    git -C "$work_dir" commit -q -m "Add tracked file"
    printf '%s\n' "unstaged" > "$work_dir/tracked.txt"

    run_loop "$work_dir" codex

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "clean git worktree before starting"
    assert_contains "$run_stderr" "unstaged"
}

assert_loop_rejects_untracked_startup_files() {
    work_dir=$(create_project untracked-startup)

    printf '%s\n' "untracked" > "$work_dir/untracked.txt"

    run_loop "$work_dir" codex

    assert_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "clean git worktree before starting"
    assert_contains "$run_stderr" "untracked"
}

assert_loop_processes_dependent_tickets_sequentially() {
    work_dir=$(create_project sequential)
    fake_dir=$tmp_dir/fake-sequential

    write_fake_agent "$fake_dir"
    write_ticket \
        "$work_dir/.coderail/tickets/open/0001-first-ticket.md" \
        0001 \
        first-ticket \
        "First Ticket" \
        open \
        "" \
        ""
    write_ticket \
        "$work_dir/.coderail/tickets/open/0002-second-ticket.md" \
        0002 \
        second-ticket \
        "Second Ticket" \
        open \
        "0001" \
        ""
    commit_all "$work_dir" "Add tickets"

    run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_success
    assert_file_content "$run_fake_agent_log" '$ticket-implement ".coderail/tickets/open/0001-first-ticket.md"
$ticket-implement ".coderail/tickets/open/0002-second-ticket.md"'
    assert_file "$work_dir/.coderail/tickets/closed/0001-first-ticket.md"
    assert_file "$work_dir/.coderail/tickets/closed/0002-second-ticket.md"
}

assert_loop_respects_default_processing_max() {
    work_dir=$(create_project default-processing-max)
    fake_dir=$tmp_dir/fake-default-processing-max

    write_fake_agent "$fake_dir"

    for ticket_id in 0001 0002 0003 0004 0005 0006; do
        write_ticket \
            "$work_dir/.coderail/tickets/open/$ticket_id-ticket-$ticket_id.md" \
            "$ticket_id" \
            "ticket-$ticket_id" \
            "Ticket $ticket_id" \
            open \
            "" \
            ""
    done
    commit_all "$work_dir" "Add tickets"

    run_loop_with_fake "$work_dir" "$fake_dir" codex

    assert_success
    assert_line_count "$run_fake_agent_log" 5
    assert_file "$work_dir/.coderail/tickets/open/0006-ticket-0006.md"
}

assert_loop_respects_explicit_processing_max() {
    work_dir=$(create_project explicit-processing-max)
    fake_dir=$tmp_dir/fake-explicit-processing-max

    write_fake_agent "$fake_dir"

    for ticket_id in 0001 0002 0003; do
        write_ticket \
            "$work_dir/.coderail/tickets/open/$ticket_id-ticket-$ticket_id.md" \
            "$ticket_id" \
            "ticket-$ticket_id" \
            "Ticket $ticket_id" \
            open \
            "" \
            ""
    done
    commit_all "$work_dir" "Add tickets"

    run_loop_with_fake "$work_dir" "$fake_dir" --max 2 codex

    assert_success
    assert_line_count "$run_fake_agent_log" 2
    assert_file "$work_dir/.coderail/tickets/open/0003-ticket-0003.md"
}

assert_loop_streams_agent_output_by_default() {
    work_dir=$(create_project stream-output)
    fake_dir=$tmp_dir/fake-stream-output

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-stream-output.md" 0001 stream-output "Stream Output" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_STDOUT="fake agent stdout" \
    FAKE_AGENT_STDERR="fake agent stderr" \
        run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_success
    assert_contains "$run_stdout" "fake agent stdout"
    assert_contains "$run_stderr" "fake agent stderr"
}

assert_loop_writes_agent_output_to_output_dir() {
    work_dir=$(create_project output-dir-log)
    fake_dir=$tmp_dir/fake-output-dir-log
    output_dir=$tmp_dir/output-dir-log-files
    log_file=$output_dir/0001-output-dir-log.log

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-output-dir-log.md" 0001 output-dir-log "Output Dir Log" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_STDOUT="fake agent stdout" \
    FAKE_AGENT_STDERR="fake agent stderr" \
        run_loop_with_fake "$work_dir" "$fake_dir" --all --output-dir "$output_dir" codex

    assert_success
    assert_dir "$output_dir"
    assert_file "$log_file"
    assert_contains "$log_file" "fake agent stdout"
    assert_contains "$log_file" "fake agent stderr"
    assert_contains "$log_file" ".coderail/tickets/closed/0001-output-dir-log.md"
    assert_file_empty "$run_stdout"
    assert_file_empty "$run_stderr"
}

assert_loop_progress_only_discards_agent_output_and_prints_handoffs() {
    work_dir=$(create_project progress-only-routing)
    fake_dir=$tmp_dir/fake-progress-only-routing

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-progress-one.md" 0001 progress-one "Progress One" open "" ""
    write_ticket "$work_dir/.coderail/tickets/open/0002-progress-two.md" 0002 progress-two "Progress Two" open "" ""
    commit_all "$work_dir" "Add tickets"

    FAKE_AGENT_STDOUT="fake agent stdout" \
    FAKE_AGENT_STDERR="fake agent stderr" \
        run_loop_with_fake "$work_dir" "$fake_dir" --all --progress-only codex

    assert_success
    assert_contains "$run_stdout" "ticket loop handoff: .coderail/tickets/open/0001-progress-one.md"
    assert_contains "$run_stdout" "ticket loop handoff: .coderail/tickets/open/0002-progress-two.md"
    assert_not_contains "$run_stdout" "fake agent stdout"
    assert_file_empty "$run_stderr"
}

assert_loop_progress_only_stops_on_agent_failure() {
    work_dir=$(create_project progress-only-agent-failure)
    fake_dir=$tmp_dir/fake-progress-only-agent-failure

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-first-ticket.md" 0001 first-ticket "First Ticket" open "" ""
    write_ticket "$work_dir/.coderail/tickets/open/0002-second-ticket.md" 0002 second-ticket "Second Ticket" open "" ""
    commit_all "$work_dir" "Add tickets"

    FAKE_AGENT_FAIL_ON=1 \
    FAKE_AGENT_STDOUT="fake agent stdout" \
    FAKE_AGENT_STDERR="fake agent stderr" \
        run_loop_with_fake "$work_dir" "$fake_dir" --all --progress-only codex

    assert_failure
    assert_line_count "$run_fake_agent_log" 1
    assert_contains "$run_stdout" "ticket loop handoff: .coderail/tickets/open/0001-first-ticket.md"
    assert_not_contains "$run_stdout" "ticket loop handoff: .coderail/tickets/open/0002-second-ticket.md"
    assert_not_contains "$run_stdout" "fake agent stdout"
    assert_not_contains "$run_stderr" "fake agent stderr"
    assert_contains "$run_stderr" "agent failed for ticket: .coderail/tickets/open/0001-first-ticket.md"
    assert_file "$work_dir/.coderail/tickets/open/0001-first-ticket.md"
    assert_file "$work_dir/.coderail/tickets/open/0002-second-ticket.md"
}

assert_loop_quiet_suppresses_default_agent_output() {
    work_dir=$(create_project quiet-default-routing)
    fake_dir=$tmp_dir/fake-quiet-default-routing

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-quiet-default.md" 0001 quiet-default "Quiet Default" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_STDOUT="fake agent stdout" \
    FAKE_AGENT_STDERR="fake agent stderr" \
        run_quiet_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_success
    assert_file_empty "$run_stdout"
    assert_file_empty "$run_stderr"
}

assert_loop_quiet_progress_only_suppresses_progress_and_agent_output() {
    work_dir=$(create_project quiet-progress-only-routing)
    fake_dir=$tmp_dir/fake-quiet-progress-only-routing

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-quiet-progress.md" 0001 quiet-progress "Quiet Progress" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_STDOUT="fake agent stdout" \
    FAKE_AGENT_STDERR="fake agent stderr" \
        run_quiet_loop_with_fake "$work_dir" "$fake_dir" --all --progress-only codex

    assert_success
    assert_file_empty "$run_stdout"
    assert_file_empty "$run_stderr"
}

assert_loop_quiet_output_dir_keeps_terminal_empty_and_writes_log() {
    work_dir=$(create_project quiet-output-dir-routing)
    fake_dir=$tmp_dir/fake-quiet-output-dir-routing
    output_dir=$tmp_dir/quiet-output-dir-log-files
    log_file=$output_dir/0001-quiet-output-dir.log

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-quiet-output-dir.md" 0001 quiet-output-dir "Quiet Output Dir" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_STDOUT="fake agent stdout" \
    FAKE_AGENT_STDERR="fake agent stderr" \
        run_quiet_loop_with_fake "$work_dir" "$fake_dir" --all --output-dir "$output_dir" codex

    assert_success
    assert_file_empty "$run_stdout"
    assert_file_empty "$run_stderr"
    assert_file "$log_file"
    assert_contains "$log_file" "fake agent stdout"
    assert_contains "$log_file" "fake agent stderr"
}

assert_loop_quiet_reports_agent_failure() {
    work_dir=$(create_project quiet-agent-failure)
    fake_dir=$tmp_dir/fake-quiet-agent-failure

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-first-ticket.md" 0001 first-ticket "First Ticket" open "" ""
    write_ticket "$work_dir/.coderail/tickets/open/0002-second-ticket.md" 0002 second-ticket "Second Ticket" open "" ""
    commit_all "$work_dir" "Add tickets"

    FAKE_AGENT_FAIL_ON=1 \
    FAKE_AGENT_STDOUT="fake agent stdout" \
    FAKE_AGENT_STDERR="fake agent stderr" \
        run_quiet_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_failure
    assert_file_empty "$run_stdout"
    assert_line_count "$run_fake_agent_log" 1
    assert_not_contains "$run_stderr" "fake agent stderr"
    assert_contains "$run_stderr" "agent failed for ticket: .coderail/tickets/open/0001-first-ticket.md"
}

assert_loop_rejects_output_dir_file() {
    work_dir=$(create_project output-dir-file)
    fake_dir=$tmp_dir/fake-output-dir-file
    output_dir=$tmp_dir/output-dir-file-path

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-output-dir-file.md" 0001 output-dir-file "Output Dir File" open "" ""
    commit_all "$work_dir" "Add ticket"
    printf '%s\n' "not a directory" > "$output_dir"

    run_loop_with_fake "$work_dir" "$fake_dir" --all --output-dir "$output_dir" codex

    assert_failure
    assert_contains "$run_stderr" "--output-dir is not a directory: $output_dir"
    assert_no_path "$run_fake_agent_count"
}

assert_loop_rejects_existing_output_log() {
    work_dir=$(create_project existing-output-log)
    fake_dir=$tmp_dir/fake-existing-output-log
    output_dir=$tmp_dir/existing-output-log-dir
    log_file=$output_dir/0001-existing-output-log.log

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-existing-output-log.md" 0001 existing-output-log "Existing Output Log" open "" ""
    commit_all "$work_dir" "Add ticket"
    mkdir -p "$output_dir"
    printf '%s\n' "existing log" > "$log_file"

    run_loop_with_fake "$work_dir" "$fake_dir" --all --output-dir "$output_dir" codex

    assert_failure
    assert_contains "$run_stderr" "ticket loop output log already exists: $log_file"
    assert_no_path "$run_fake_agent_count"
    assert_file_content "$log_file" "existing log"
}

assert_loop_stops_on_agent_failure() {
    work_dir=$(create_project agent-failure)
    fake_dir=$tmp_dir/fake-agent-failure

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-first-ticket.md" 0001 first-ticket "First Ticket" open "" ""
    write_ticket "$work_dir/.coderail/tickets/open/0002-second-ticket.md" 0002 second-ticket "Second Ticket" open "" ""
    commit_all "$work_dir" "Add tickets"

    FAKE_AGENT_FAIL_ON=1 run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_failure
    assert_line_count "$run_fake_agent_log" 1
    assert_contains "$run_stderr" "fake agent failure"
    assert_contains "$run_stderr" "agent failed for ticket: .coderail/tickets/open/0001-first-ticket.md"
    assert_not_contains "$run_stderr" "ticket was not closed as satisfied"
    assert_no_staged_changes "$work_dir"
    assert_file "$work_dir/work-1.txt"
    assert_file "$work_dir/.coderail/tickets/open/0001-first-ticket.md"
    assert_file "$work_dir/.coderail/tickets/open/0002-second-ticket.md"
}

assert_loop_stages_post_agent_changes() {
    work_dir=$(create_project staging)
    fake_dir=$tmp_dir/fake-staging
    staged_paths=$tmp_dir/staged-paths

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-first-ticket.md" 0001 first-ticket "First Ticket" open "" ""
    commit_all "$work_dir" "Add tickets"

    run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_success
    git -C "$work_dir" diff --cached --name-only > "$staged_paths"
    assert_contains "$staged_paths" ".coderail/tickets/closed/0001-first-ticket.md"
    assert_contains "$staged_paths" "work-1.txt"
    assert_no_unstaged_or_untracked_changes "$work_dir"
}

assert_loop_rejects_unsafe_handoff_state() {
    work_dir=$(create_project unsafe-handoff)
    fake_dir=$tmp_dir/fake-unsafe-handoff

    write_fake_agent "$fake_dir"
    write_git_add_dirty_wrapper "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-first-ticket.md" 0001 first-ticket "First Ticket" open "" ""
    write_ticket "$work_dir/.coderail/tickets/open/0002-second-ticket.md" 0002 second-ticket "Second Ticket" open "" ""
    commit_all "$work_dir" "Add tickets"

    run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_failure
    assert_line_count "$run_fake_agent_log" 1
    assert_contains "$run_stderr" "ticket loop handoff requires no unstaged or untracked changes"
    assert_file "$work_dir/handoff-dirty.txt"
}

assert_loop_accepts_done_closed_ticket() {
    work_dir=$(create_project done-close)
    fake_dir=$tmp_dir/fake-done-close

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-first-ticket.md" 0001 first-ticket "First Ticket" open "" ""
    commit_all "$work_dir" "Add tickets"

    run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_success
    assert_file "$work_dir/.coderail/tickets/closed/0001-first-ticket.md"
}

assert_loop_rejects_open_ticket() {
    work_dir=$(create_project open-close)
    fake_dir=$tmp_dir/fake-open-close

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-first-ticket.md" 0001 first-ticket "First Ticket" open "" ""
    commit_all "$work_dir" "Add tickets"

    FAKE_AGENT_CLOSE_REASON=open run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_failure
    assert_contains "$run_stderr" "ticket was not closed as satisfied: 0001"
    assert_file "$work_dir/.coderail/tickets/open/0001-first-ticket.md"
}

assert_loop_rejects_active_ticket() {
    work_dir=$(create_project active-close)
    fake_dir=$tmp_dir/fake-active-close

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-first-ticket.md" 0001 first-ticket "First Ticket" open "" ""
    commit_all "$work_dir" "Add tickets"

    FAKE_AGENT_CLOSE_REASON=active run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_failure
    assert_contains "$run_stderr" "ticket was not closed as satisfied: 0001"
    assert_file "$work_dir/.coderail/tickets/active/0001-first-ticket.md"
}

assert_loop_rejects_unsatisfied_closed_ticket() {
    work_dir=$(create_project unsatisfied-close)
    fake_dir=$tmp_dir/fake-unsatisfied-close

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-first-ticket.md" 0001 first-ticket "First Ticket" open "" ""
    commit_all "$work_dir" "Add tickets"

    FAKE_AGENT_CLOSE_REASON=dismissed run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_failure
    assert_contains "$run_stderr" "ticket was not closed as satisfied: 0001"
}

assert_loop_leaves_rejected_changes_unstaged() {
    work_dir=$(create_project rejected-unstaged)
    fake_dir=$tmp_dir/fake-rejected-unstaged

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-first-ticket.md" 0001 first-ticket "First Ticket" open "" ""
    commit_all "$work_dir" "Add tickets"

    FAKE_AGENT_CLOSE_REASON=dismissed run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_failure
    assert_contains "$run_stderr" "ticket was not closed as satisfied: 0001"
    assert_no_staged_changes "$work_dir"
    assert_file "$work_dir/work-1.txt"
    assert_file "$work_dir/.coderail/tickets/closed/0001-first-ticket.md"
}

assert_loop_rejects_deferred_closed_ticket() {
    work_dir=$(create_project deferred-close)
    fake_dir=$tmp_dir/fake-deferred-close

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-first-ticket.md" 0001 first-ticket "First Ticket" open "" ""
    commit_all "$work_dir" "Add tickets"

    FAKE_AGENT_CLOSE_REASON=deferred run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_failure
    assert_contains "$run_stderr" "ticket was not closed as satisfied: 0001"
}

assert_loop_accepts_duplicate_closed_to_done() {
    work_dir=$(create_project duplicate-close)
    fake_dir=$tmp_dir/fake-duplicate-close

    write_fake_agent "$fake_dir"
    write_ticket \
        "$work_dir/.coderail/tickets/closed/0001-done-ticket.md" \
        0001 \
        done-ticket \
        "Done Ticket" \
        closed \
        "" \
        "close_reason: done
"
    write_ticket "$work_dir/.coderail/tickets/open/0002-duplicate-ticket.md" 0002 duplicate-ticket "Duplicate Ticket" open "" ""
    commit_all "$work_dir" "Add tickets"

    FAKE_AGENT_CLOSE_REASON=duplicate \
    FAKE_AGENT_DUPLICATE_OF=0001 \
        run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_success
    assert_file "$work_dir/.coderail/tickets/closed/0002-duplicate-ticket.md"
}

assert_loop_rejects_duplicate_closed_to_unsatisfied() {
    work_dir=$(create_project duplicate-unsatisfied-close)
    fake_dir=$tmp_dir/fake-duplicate-unsatisfied-close

    write_fake_agent "$fake_dir"
    write_ticket \
        "$work_dir/.coderail/tickets/closed/0001-dismissed-ticket.md" \
        0001 \
        dismissed-ticket \
        "Dismissed Ticket" \
        closed \
        "" \
        "close_reason: dismissed
"
    write_ticket "$work_dir/.coderail/tickets/open/0002-duplicate-ticket.md" 0002 duplicate-ticket "Duplicate Ticket" open "" ""
    commit_all "$work_dir" "Add tickets"

    FAKE_AGENT_CLOSE_REASON=duplicate \
    FAKE_AGENT_DUPLICATE_OF=0001 \
        run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_failure
    assert_contains "$run_stderr" "ticket was not closed as satisfied: 0002"
    assert_file "$work_dir/.coderail/tickets/closed/0002-duplicate-ticket.md"
}

print_tests_header "Ticket Loop Tests"
test "Loop shows short help" assert_loop_short_help
test "Loop shows long help" assert_loop_long_help
test "Loop uses default max" assert_loop_uses_default_max
test "Loop accepts short max" assert_loop_accepts_short_max
test "Loop accepts long max" assert_loop_accepts_long_max
test "Loop accepts all" assert_loop_accepts_all
test "Loop accepts output dir" assert_loop_accepts_output_dir
test "Loop accepts output dir equals" assert_loop_accepts_output_dir_equals
test "Loop accepts progress only" assert_loop_accepts_progress_only
test "Loop rejects repeated max" assert_loop_rejects_repeated_max
test "Loop rejects repeated output dir" assert_loop_rejects_repeated_output_dir
test "Loop rejects repeated progress only" assert_loop_rejects_repeated_progress_only
test "Loop rejects progress only with output dir" assert_loop_rejects_progress_only_with_output_dir
test "Loop rejects all with max" assert_loop_rejects_all_with_max
test "Loop rejects missing max value" assert_loop_rejects_missing_max_value
test "Loop rejects missing output dir value" assert_loop_rejects_missing_output_dir_value
test "Loop rejects empty output dir value" assert_loop_rejects_empty_output_dir_value
test "Loop rejects empty output dir equals value" assert_loop_rejects_empty_output_dir_equals_value
test "Loop rejects invalid max value" assert_loop_rejects_invalid_max_value
test "Loop rejects unknown option" assert_loop_rejects_unknown_option
test "Loop rejects unexpected argument" assert_loop_rejects_unexpected_argument
test "Loop accepts supported tools" assert_loop_accepts_supported_tools
test "Loop invokes supported tools noninteractively" assert_loop_invokes_supported_tools_noninteractively
test "Loop explicit tool wins" assert_loop_explicit_tool_wins
test "Loop uses user default tool" assert_loop_uses_user_default_tool
test "Loop repo default overrides user default" assert_loop_repo_default_overrides_user_default
test "Loop rejects missing default tool" assert_loop_rejects_missing_default_tool
test "Loop rejects unknown explicit tool" assert_loop_rejects_unknown_explicit_tool
test "Loop rejects unknown default tool" assert_loop_rejects_unknown_default_tool
test "Loop allows clean startup" assert_loop_allows_clean_startup
test "Loop rejects staged startup changes" assert_loop_rejects_staged_startup_changes
test "Loop rejects unstaged startup changes" assert_loop_rejects_unstaged_startup_changes
test "Loop rejects untracked startup files" assert_loop_rejects_untracked_startup_files
test "Loop processes dependent tickets sequentially" assert_loop_processes_dependent_tickets_sequentially
test "Loop respects default processing max" assert_loop_respects_default_processing_max
test "Loop respects explicit processing max" assert_loop_respects_explicit_processing_max
test "Loop streams agent output by default" assert_loop_streams_agent_output_by_default
test "Loop writes agent output to output dir" assert_loop_writes_agent_output_to_output_dir
test "Loop progress only discards agent output and prints handoffs" assert_loop_progress_only_discards_agent_output_and_prints_handoffs
test "Loop progress only stops on agent failure" assert_loop_progress_only_stops_on_agent_failure
test "Loop quiet suppresses default agent output" assert_loop_quiet_suppresses_default_agent_output
test "Loop quiet progress only suppresses progress and agent output" assert_loop_quiet_progress_only_suppresses_progress_and_agent_output
test "Loop quiet output dir keeps terminal empty and writes log" assert_loop_quiet_output_dir_keeps_terminal_empty_and_writes_log
test "Loop quiet reports agent failure" assert_loop_quiet_reports_agent_failure
test "Loop rejects output dir file" assert_loop_rejects_output_dir_file
test "Loop rejects existing output log" assert_loop_rejects_existing_output_log
test "Loop stops on agent failure" assert_loop_stops_on_agent_failure
test "Loop stages post-agent changes" assert_loop_stages_post_agent_changes
test "Loop rejects unsafe handoff state" assert_loop_rejects_unsafe_handoff_state
test "Loop accepts done closed ticket" assert_loop_accepts_done_closed_ticket
test "Loop rejects open ticket" assert_loop_rejects_open_ticket
test "Loop rejects active ticket" assert_loop_rejects_active_ticket
test "Loop rejects unsatisfied closed ticket" assert_loop_rejects_unsatisfied_closed_ticket
test "Loop leaves rejected changes unstaged" assert_loop_leaves_rejected_changes_unstaged
test "Loop rejects deferred closed ticket" assert_loop_rejects_deferred_closed_ticket
test "Loop accepts duplicate closed to done" assert_loop_accepts_duplicate_closed_to_done
test "Loop rejects duplicate closed to unsatisfied" assert_loop_rejects_duplicate_closed_to_unsatisfied

print_tests_summary

if some_tests_failed; then
    exit 1
fi
