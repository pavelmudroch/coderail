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

assert_occurrence_count() {
    file=$1
    value=$2
    expected_count=$3
    actual_count=$(grep -F -c -- "$value" "$file" || true)

    [ "$actual_count" -eq "$expected_count" ] ||
        fail "$file occurrence count differs: expected $expected_count, got $actual_count"
}

assert_match_count() {
    file=$1
    pattern=$2
    expected_count=$3
    actual_count=$(grep -E -c -- "$pattern" "$file" || true)

    [ "$actual_count" -eq "$expected_count" ] ||
        fail "$file match count differs: expected $expected_count, got $actual_count"
}

assert_order() {
    file=$1
    first=$2
    second=$3
    first_line=$(grep -F -n -- "$first" "$file" | sed -n '1s/:.*//p')
    second_line=$(grep -F -n -- "$second" "$file" | sed -n '1s/:.*//p')

    [ -n "$first_line" ] || fail "$file does not contain: $first"
    [ -n "$second_line" ] || fail "$file does not contain: $second"
    [ "$first_line" -lt "$second_line" ] ||
        fail "$first should appear before $second in $file"
}

assert_ignored() {
    work_dir=$1
    path=$2

    git -C "$work_dir" check-ignore -q -- "$path" ||
        fail "$path is not ignored"
}

assert_only_staged_path() {
    work_dir=$1
    expected_path=$2
    staged_paths=$tmp_dir/staged-paths

    git -C "$work_dir" diff --cached --name-only > "$staged_paths"
    assert_file_content "$staged_paths" "$expected_path"
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

write_loop_ignore() {
    work_dir=$1

    mkdir -p "$work_dir/.coderail/loop"
    printf '*\n!.gitignore\n' > "$work_dir/.coderail/loop/.gitignore"
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
prompt_kind=
case "$prompt" in
    '$cr-ticket-implement "'*'"')
        prompt_kind=implementation
        ticket_reference=${prompt#'$cr-ticket-implement "'}
        ticket_reference=${ticket_reference%'"'}
        ;;
    '/cr-ticket-implement "'*'"')
        prompt_kind=implementation
        ticket_reference=${prompt#'/cr-ticket-implement "'}
        ticket_reference=${ticket_reference%'"'}
        ;;
    '$cr-review-auto "'*'"')
        prompt_kind=review
        ticket_reference=${prompt#'$cr-review-auto "'}
        ticket_reference=${ticket_reference%'"'}
        ;;
    '/cr-review-auto "'*'"')
        prompt_kind=review
        ticket_reference=${prompt#'/cr-review-auto "'}
        ticket_reference=${ticket_reference%'"'}
        ;;
    *)
        echo "fake agent expected ticket prompt" >&2
        exit 65
        ;;
esac

[ -n "$ticket_reference" ] || {
    echo "fake agent expected ticket reference" >&2
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

if [ "${FAKE_AGENT_HANDOFF_OUTPUT:-}" = true ]; then
    printf 'fake agent %s handoff\n' "$prompt_kind"
fi

if [ "${FAKE_AGENT_FAIL_ON:-}" = "$count" ]; then
    printf 'failed %s\n' "$ticket_reference" > "work-$count.txt"
    echo "fake agent failure" >&2
    exit 7
fi

if [ "$prompt_kind" = review ]; then
    case "${FAKE_AGENT_REVIEW_RESULT:-clean}" in
        clean)
            ;;
        reopen)
            "$CODERAIL_BIN_PATH" ticket reopen "$ticket_reference" >/dev/null
            ;;
        reopen-once)
            review_marker=$FAKE_AGENT_COUNT_FILE.reviewed
            if [ ! -f "$review_marker" ]; then
                : > "$review_marker"
                "$CODERAIL_BIN_PATH" ticket reopen "$ticket_reference" >/dev/null
            fi
            ;;
        follow-up)
            "$CODERAIL_BIN_PATH" ticket create \
                --depends-on "$ticket_reference" \
                "Review Follow Up" >/dev/null
            ;;
        active)
            reopened_ticket=$("$CODERAIL_BIN_PATH" ticket reopen "$ticket_reference")
            "$CODERAIL_BIN_PATH" ticket activate "$reopened_ticket" >/dev/null
            ;;
        invalid)
            reopened_ticket=$("$CODERAIL_BIN_PATH" ticket reopen "$ticket_reference")
            sed -i 's/^status: open$/status: invalid/' "$reopened_ticket"
            ;;
        *)
            echo "unknown fake review result: $FAKE_AGENT_REVIEW_RESULT" >&2
            exit 66
            ;;
    esac

    exit 0
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
    FAKE_AGENT_HANDOFF_OUTPUT=${FAKE_AGENT_HANDOFF_OUTPUT-} \
    FAKE_AGENT_LOG=$run_fake_agent_log \
    FAKE_AGENT_REVIEW_RESULT=${FAKE_AGENT_REVIEW_RESULT-} \
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
    FAKE_AGENT_HANDOFF_OUTPUT=${FAKE_AGENT_HANDOFF_OUTPUT-} \
    FAKE_AGENT_LOG=$run_fake_agent_log \
    FAKE_AGENT_REVIEW_RESULT=${FAKE_AGENT_REVIEW_RESULT-} \
    FAKE_AGENT_STDERR=${FAKE_AGENT_STDERR-} \
    FAKE_AGENT_STDOUT=${FAKE_AGENT_STDOUT-} \
    PATH="$fake_dir:$PATH" \
    REAL_GIT=$real_git \
        "$CR" --quiet --cwd "$work_dir" ticket loop "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_verbose_loop_with_fake() {
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
    FAKE_AGENT_HANDOFF_OUTPUT=${FAKE_AGENT_HANDOFF_OUTPUT-} \
    FAKE_AGENT_LOG=$run_fake_agent_log \
    FAKE_AGENT_REVIEW_RESULT=${FAKE_AGENT_REVIEW_RESULT-} \
    FAKE_AGENT_STDERR=${FAKE_AGENT_STDERR-} \
    FAKE_AGENT_STDOUT=${FAKE_AGENT_STDOUT-} \
    PATH="$fake_dir:$PATH" \
    REAL_GIT=$real_git \
        "$CR" --cwd "$work_dir" --verbose ticket loop "$@" > "$run_stdout" 2> "$run_stderr"
    run_status=$?
    set -e
}

run_loop_with_fake_combined() {
    work_dir=$1
    fake_dir=$2
    shift 2

    run_output=$tmp_dir/run.output
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
    FAKE_AGENT_HANDOFF_OUTPUT=${FAKE_AGENT_HANDOFF_OUTPUT-} \
    FAKE_AGENT_LOG=$run_fake_agent_log \
    FAKE_AGENT_REVIEW_RESULT=${FAKE_AGENT_REVIEW_RESULT-} \
    FAKE_AGENT_STDERR=${FAKE_AGENT_STDERR-} \
    FAKE_AGENT_STDOUT=${FAKE_AGENT_STDOUT-} \
    PATH="$fake_dir:$PATH" \
    REAL_GIT=$real_git \
        "$CR" --cwd "$work_dir" ticket loop "$@" > "$run_output" 2>&1
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
    assert_contains "$run_stdout" "--auto-review"
    assert_not_contains "$run_stdout" "--output-dir"
    assert_not_contains "$run_stdout" "--progress-only"
    assert_file_empty "$run_stderr"
}

assert_loop_long_help() {
    work_dir=$(create_project long-help)

    run_loop "$work_dir" --help

    assert_success
    assert_contains "$run_stdout" "Usage:"
    assert_contains "$run_stdout" "cr ticket loop"
    assert_contains "$run_stdout" "--auto-review"
    assert_not_contains "$run_stdout" "--output-dir"
    assert_not_contains "$run_stdout" "--progress-only"
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

assert_loop_accepts_auto_review() {
    work_dir=$(create_project auto-review)

    run_loop "$work_dir" --auto-review codex

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

assert_loop_rejects_repeated_auto_review() {
    work_dir=$(create_project repeated-auto-review)

    run_loop "$work_dir" --auto-review --auto-review codex

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "--auto-review provided multiple times"
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

assert_loop_rejects_removed_output_dir() {
    work_dir=$(create_project removed-output-dir)

    run_loop "$work_dir" --output-dir "$tmp_dir/output-dir" codex

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "unknown option: --output-dir"
}

assert_loop_rejects_removed_output_dir_equals() {
    work_dir=$(create_project removed-output-dir-equals)

    run_loop "$work_dir" --output-dir="$tmp_dir/output-dir" codex

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "unknown option: --output-dir=$tmp_dir/output-dir"
}

assert_loop_rejects_removed_progress_only() {
    work_dir=$(create_project removed-progress-only)

    run_loop "$work_dir" --progress-only codex

    assert_usage_failure
    assert_file_empty "$run_stdout"
    assert_contains "$run_stderr" "unknown option: --progress-only"
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
        expected_prompt='/cr-ticket-implement ".coderail/tickets/open/0001-command-form.md"'

        if [ "$tool" = codex ]; then
            expected_prompt='$cr-ticket-implement ".coderail/tickets/open/0001-command-form.md"'
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

assert_loop_auto_reviews_supported_tools() {
    for tool in codex copilot claude gemini; do
        work_dir=$(create_project "auto-review-command-form-$tool")
        fake_dir=$tmp_dir/fake-auto-review-command-form-$tool
        implementation_prompt='/cr-ticket-implement ".coderail/tickets/open/0001-auto-review-command-form.md"'
        review_prompt='/cr-review-auto "0001"'

        if [ "$tool" = codex ]; then
            implementation_prompt='$cr-ticket-implement ".coderail/tickets/open/0001-auto-review-command-form.md"'
            review_prompt='$cr-review-auto "0001"'
        fi

        write_fake_agent "$fake_dir"
        write_ticket \
            "$work_dir/.coderail/tickets/open/0001-auto-review-command-form.md" \
            0001 \
            auto-review-command-form \
            "Auto Review Command Form" \
            open \
            "" \
            ""
        commit_all "$work_dir" "Add ticket"

        run_loop_with_fake "$work_dir" "$fake_dir" --all --auto-review "$tool"

        assert_success
        assert_file_content "$run_fake_agent_log" "$implementation_prompt
$review_prompt"
        assert_file "$work_dir/.coderail/tickets/closed/0001-auto-review-command-form.md"
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
    assert_file_content "$run_fake_agent_log" '$cr-ticket-implement ".coderail/tickets/open/0001-first-ticket.md"
$cr-ticket-implement ".coderail/tickets/open/0002-second-ticket.md"'
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

assert_loop_does_not_create_transcript_setup_without_ready_ticket() {
    work_dir=$(create_project no-ready-ticket)
    fake_dir=$tmp_dir/fake-no-ready-ticket

    write_fake_agent "$fake_dir"

    run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_success
    assert_no_path "$work_dir/.coderail/loop"
    assert_no_path "$run_fake_agent_count"
}

assert_loop_writes_mapped_transcript() {
    work_dir=$(create_project mapped-transcript)
    fake_dir=$tmp_dir/fake-mapped-transcript
    transcript=$work_dir/.coderail/loop/0001-mapped-transcript.txt
    ansi_bytes=$(printf '\033[31mansi bytes\033[0m')
    stdout="fake agent stdout $ansi_bytes"
    stderr="fake agent stderr"

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-mapped-transcript.md" 0001 mapped-transcript "Mapped Transcript" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_STDOUT=$stdout \
    FAKE_AGENT_STDERR=$stderr \
        run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_success
    assert_file "$transcript"
    assert_contains "$transcript" "$stdout"
    assert_contains "$transcript" "$stderr"
    assert_not_contains "$run_stdout" "$stdout"
    assert_not_contains "$run_stderr" "$stderr"
    assert_ignored "$work_dir" .coderail/loop/0001-mapped-transcript.txt
}

assert_loop_appends_phase_delimiters_to_reopened_transcript() {
    work_dir=$(create_project reopened-transcript)
    fake_dir=$tmp_dir/fake-reopened-transcript
    transcript=$work_dir/.coderail/loop/0001-reopened-transcript.txt

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-reopened-transcript.md" 0001 reopened-transcript "Reopened Transcript" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_HANDOFF_OUTPUT=true \
    FAKE_AGENT_REVIEW_RESULT=reopen-once \
        run_loop_with_fake "$work_dir" "$fake_dir" --max 1 --auto-review codex

    assert_success
    commit_all "$work_dir" "Checkpoint reopened ticket"

    FAKE_AGENT_HANDOFF_OUTPUT=true \
    FAKE_AGENT_REVIEW_RESULT=reopen-once \
        run_loop_with_fake "$work_dir" "$fake_dir" --all --auto-review codex

    assert_success
    assert_file "$transcript"
    assert_match_count "$transcript" '^[[:print:]]*[0-9]{4}-[0-9]{2}-[0-9]{2}[[:print:]]*implementation[[:print:]]*$' 2
    assert_match_count "$transcript" '^[[:print:]]*[0-9]{4}-[0-9]{2}-[0-9]{2}[[:print:]]*review[[:print:]]*$' 2
    assert_occurrence_count "$transcript" "fake agent implementation handoff" 2
    assert_occurrence_count "$transcript" "fake agent review handoff" 2
}

assert_loop_writes_ignored_transcripts_for_multiple_tickets() {
    work_dir=$(create_project multiple-transcripts)
    fake_dir=$tmp_dir/fake-multiple-transcripts

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-first-transcript.md" 0001 first-transcript "First Transcript" open "" ""
    write_ticket "$work_dir/.coderail/tickets/open/0002-second-transcript.md" 0002 second-transcript "Second Transcript" open "" ""
    commit_all "$work_dir" "Add tickets"

    run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_success
    assert_file "$work_dir/.coderail/loop/0001-first-transcript.txt"
    assert_file "$work_dir/.coderail/loop/0002-second-transcript.txt"
    assert_ignored "$work_dir" .coderail/loop/0001-first-transcript.txt
    assert_ignored "$work_dir" .coderail/loop/0002-second-transcript.txt
    assert_no_unstaged_or_untracked_changes "$work_dir"
}

assert_loop_quiet_writes_transcript() {
    work_dir=$(create_project quiet-transcript)
    fake_dir=$tmp_dir/fake-quiet-transcript
    transcript=$work_dir/.coderail/loop/0001-quiet-transcript.txt

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-quiet-transcript.md" 0001 quiet-transcript "Quiet Transcript" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_STDOUT="fake agent stdout" \
    FAKE_AGENT_STDERR="fake agent stderr" \
        run_quiet_loop_with_fake "$work_dir" "$fake_dir" --all --auto-review codex

    assert_success
    assert_file "$transcript"
    assert_contains "$transcript" "fake agent stdout"
    assert_contains "$transcript" "fake agent stderr"
    assert_file_empty "$run_stdout"
    assert_file_empty "$run_stderr"
}

assert_loop_reports_ticket_progress() {
    work_dir=$(create_project ticket-progress)
    fake_dir=$tmp_dir/fake-ticket-progress

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-ticket-progress.md" 0001 ticket-progress "Ticket Progress" open "" ""
    commit_all "$work_dir" "Add ticket"

    run_loop_with_fake "$work_dir" "$fake_dir" --max 2 --auto-review codex

    assert_success
    assert_contains "$run_stdout" "[1/1] Ticket Progress"
    assert_contains "$run_stdout" "         file: .coderail/tickets/open/0001-ticket-progress.md"
    assert_contains "$run_stdout" "         inspect: tail -f .coderail/loop/0001-ticket-progress.txt"
    assert_match_count "$run_stdout" '^         implementation done in [0-9][0-9]:[0-9][0-9]$' 1
    assert_match_count "$run_stdout" '^         review done in [0-9][0-9]:[0-9][0-9]$' 1
    assert_match_count "$run_stdout" '^         completed in [0-9][0-9]:[0-9][0-9]$' 1
    assert_not_contains "$run_stdout" "fake agent"
    assert_file_empty "$run_stderr"
}

assert_loop_reports_implementation_failure_progress() {
    work_dir=$(create_project implementation-progress-failure)
    fake_dir=$tmp_dir/fake-implementation-progress-failure

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-implementation-progress-failure.md" 0001 implementation-progress-failure "Implementation Progress Failure" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_FAIL_ON=1 \
        run_loop_with_fake_combined "$work_dir" "$fake_dir" --all codex

    assert_failure
    assert_match_count "$run_output" '^         implementation failed in [0-9][0-9]:[0-9][0-9]$' 1
    assert_order "$run_output" "implementation failed in" "error: agent failed for ticket: .coderail/tickets/open/0001-implementation-progress-failure.md"
    assert_not_contains "$run_output" "completed in"
}

assert_loop_reports_review_failure_progress() {
    work_dir=$(create_project review-progress-failure)
    fake_dir=$tmp_dir/fake-review-progress-failure

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-review-progress-failure.md" 0001 review-progress-failure "Review Progress Failure" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_FAIL_ON=2 \
        run_loop_with_fake_combined "$work_dir" "$fake_dir" --all --auto-review codex

    assert_failure
    assert_match_count "$run_output" '^         implementation done in [0-9][0-9]:[0-9][0-9]$' 1
    assert_match_count "$run_output" '^         review failed in [0-9][0-9]:[0-9][0-9]$' 1
    assert_order "$run_output" "review failed in" "error: agent failed for ticket: 0001"
    assert_not_contains "$run_output" "completed in"
}

assert_loop_quiet_suppresses_ticket_progress() {
    work_dir=$(create_project quiet-ticket-progress)
    fake_dir=$tmp_dir/fake-quiet-ticket-progress

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-quiet-ticket-progress.md" 0001 quiet-ticket-progress "Quiet Ticket Progress" open "" ""
    commit_all "$work_dir" "Add ticket"

    run_quiet_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_success
    assert_file_empty "$run_stdout"
    assert_file_empty "$run_stderr"
}

assert_loop_verbose_reports_operational_notices() {
    work_dir=$(create_project verbose-operational-notices)
    fake_dir=$tmp_dir/fake-verbose-operational-notices

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-verbose-operational-notices.md" 0001 verbose-operational-notices "Verbose Operational Notices" open "" ""
    commit_all "$work_dir" "Add ticket"

    run_verbose_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_success
    assert_contains "$run_stdout" "ticket loop selecting next ticket"
    assert_contains "$run_stdout" "ticket loop selected ticket: .coderail/tickets/open/0001-verbose-operational-notices.md"
    assert_contains "$run_stdout" "ticket loop validating ticket closure: 0001"
    assert_contains "$run_stdout" "ticket loop confirmed satisfied closure: 0001"
    assert_contains "$run_stdout" "ticket loop staging post-agent changes"
    assert_file_empty "$run_stderr"
}

assert_loop_uses_ready_snapshot_headings() {
    work_dir=$(create_project ready-snapshot-headings)
    fake_dir=$tmp_dir/fake-ready-snapshot-headings

    write_fake_agent "$fake_dir"

    for ticket_id in 0001 0002 0003; do
        write_ticket \
            "$work_dir/.coderail/tickets/open/$ticket_id-ready-snapshot-$ticket_id.md" \
            "$ticket_id" \
            "ready-snapshot-$ticket_id" \
            "Ready Snapshot $ticket_id" \
            open \
            "" \
            ""
    done
    commit_all "$work_dir" "Add tickets"

    run_loop_with_fake "$work_dir" "$fake_dir" --max 5 codex

    assert_success
    assert_contains "$run_stdout" "[1/3] Ready Snapshot 0001"
    assert_contains "$run_stdout" "[2/3] Ready Snapshot 0002"
    assert_contains "$run_stdout" "[3/3] Ready Snapshot 0003"
    assert_not_contains "$run_stdout" "reviewing..."

    work_dir=$(create_project ready-snapshot-limit)
    fake_dir=$tmp_dir/fake-ready-snapshot-limit

    write_fake_agent "$fake_dir"

    for ticket_id in 0001 0002 0003; do
        write_ticket \
            "$work_dir/.coderail/tickets/open/$ticket_id-ready-snapshot-$ticket_id.md" \
            "$ticket_id" \
            "ready-snapshot-$ticket_id" \
            "Ready Snapshot $ticket_id" \
            open \
            "" \
            ""
    done
    commit_all "$work_dir" "Add tickets"

    run_loop_with_fake "$work_dir" "$fake_dir" --max 2 codex

    assert_success
    assert_contains "$run_stdout" "[1/2] Ready Snapshot 0001"
    assert_contains "$run_stdout" "[2/2] Ready Snapshot 0002"
    assert_not_contains "$run_stdout" "[3/"

    work_dir=$(create_project all-ready-snapshot-headings)
    fake_dir=$tmp_dir/fake-all-ready-snapshot-headings

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-all-ready-snapshot.md" 0001 all-ready-snapshot "All Ready Snapshot One" open "" ""
    write_ticket "$work_dir/.coderail/tickets/open/0002-all-ready-snapshot.md" 0002 all-ready-snapshot "All Ready Snapshot Two" open "" ""
    commit_all "$work_dir" "Add tickets"

    run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_success
    assert_contains "$run_stdout" "[1] All Ready Snapshot One"
    assert_contains "$run_stdout" "[2] All Ready Snapshot Two"
    assert_not_contains "$run_stdout" "[1/"
}

assert_loop_updates_headings_for_reopened_and_follow_up_tickets() {
    work_dir=$(create_project reopened-heading)
    fake_dir=$tmp_dir/fake-reopened-heading

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-reopened-heading.md" 0001 reopened-heading "Reopened Heading" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_REVIEW_RESULT=reopen-once \
        run_loop_with_fake "$work_dir" "$fake_dir" --max 2 --auto-review codex

    assert_success
    assert_contains "$run_stdout" "[1/1] Reopened Heading"
    assert_contains "$run_stdout" "[2/2] Reopened Heading"

    work_dir=$(create_project follow-up-heading)
    fake_dir=$tmp_dir/fake-follow-up-heading

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-follow-up-heading.md" 0001 follow-up-heading "Follow Up Heading" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_REVIEW_RESULT=follow-up \
        run_loop_with_fake "$work_dir" "$fake_dir" --max 2 --auto-review codex

    assert_success
    assert_contains "$run_stdout" "[1/1] Follow Up Heading"
    assert_contains "$run_stdout" "[2/2] Review Follow Up"
}

assert_loop_stages_new_ignore_before_failed_handoff() {
    work_dir=$(create_project first-use-agent-failure)
    fake_dir=$tmp_dir/fake-first-use-agent-failure
    transcript=$work_dir/.coderail/loop/0001-first-use-agent-failure.txt

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-first-use-agent-failure.md" 0001 first-use-agent-failure "First Use Agent Failure" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_FAIL_ON=1 run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_failure
    assert_line_count "$run_fake_agent_log" 1
    assert_file_content "$work_dir/.coderail/loop/.gitignore" "*
!.gitignore"
    assert_only_staged_path "$work_dir" .coderail/loop/.gitignore
    assert_file "$transcript"
    assert_ignored "$work_dir" .coderail/loop/0001-first-use-agent-failure.txt
    assert_file "$work_dir/work-1.txt"
}

assert_loop_force_stages_new_ignore_in_ignored_directory() {
    work_dir=$(create_project ignored-loop-directory)
    fake_dir=$tmp_dir/fake-ignored-loop-directory
    transcript=$work_dir/.coderail/loop/0001-ignored-loop-directory.txt

    write_fake_agent "$fake_dir"
    printf '%s\n' '.coderail/loop/' > "$work_dir/.gitignore"
    write_ticket "$work_dir/.coderail/tickets/open/0001-ignored-loop-directory.md" 0001 ignored-loop-directory "Ignored Loop Directory" open "" ""
    commit_all "$work_dir" "Add ticket and ignored loop directory"

    FAKE_AGENT_FAIL_ON=1 run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_failure
    assert_line_count "$run_fake_agent_log" 1
    assert_file_content "$work_dir/.coderail/loop/.gitignore" "*
!.gitignore"
    assert_only_staged_path "$work_dir" .coderail/loop/.gitignore
    assert_file "$transcript"
    assert_ignored "$work_dir" .coderail/loop/0001-ignored-loop-directory.txt
    assert_file "$work_dir/work-1.txt"
}

assert_loop_rejects_unignored_transcript() {
    work_dir=$(create_project unignored-transcript)
    fake_dir=$tmp_dir/fake-unignored-transcript
    transcript=.coderail/loop/0001-unignored-transcript.txt

    write_fake_agent "$fake_dir"
    mkdir -p "$work_dir/.coderail/loop"
    printf '%s\n' '!.gitignore' > "$work_dir/.coderail/loop/.gitignore"
    write_ticket "$work_dir/.coderail/tickets/open/0001-unignored-transcript.md" 0001 unignored-transcript "Unignored Transcript" open "" ""
    commit_all "$work_dir" "Add ticket and custom ignore"

    run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_failure
    assert_contains "$run_stderr" "ticket loop transcript is not ignored: $transcript"
    assert_no_path "$run_fake_agent_count"
    assert_no_path "$work_dir/$transcript"
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

assert_loop_stages_clean_auto_review() {
    work_dir=$(create_project clean-auto-review)
    fake_dir=$tmp_dir/fake-clean-auto-review
    staged_paths=$tmp_dir/clean-auto-review-staged-paths

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-clean-auto-review.md" 0001 clean-auto-review "Clean Auto Review" open "" ""
    commit_all "$work_dir" "Add ticket"

    run_loop_with_fake "$work_dir" "$fake_dir" --all --auto-review codex

    assert_success
    assert_line_count "$run_fake_agent_log" 2
    assert_file "$work_dir/.coderail/tickets/closed/0001-clean-auto-review.md"
    git -C "$work_dir" diff --cached --name-only > "$staged_paths"
    assert_contains "$staged_paths" ".coderail/tickets/closed/0001-clean-auto-review.md"
    assert_contains "$staged_paths" "work-1.txt"
    assert_no_unstaged_or_untracked_changes "$work_dir"
}

assert_loop_reimplements_reopened_ticket_with_max() {
    work_dir=$(create_project reopened-auto-review-max)
    fake_dir=$tmp_dir/fake-reopened-auto-review-max

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-reopened-auto-review.md" 0001 reopened-auto-review "Reopened Auto Review" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_REVIEW_RESULT=reopen-once \
        run_loop_with_fake "$work_dir" "$fake_dir" --max 2 --auto-review codex

    assert_success
    assert_file_content "$run_fake_agent_log" '$cr-ticket-implement ".coderail/tickets/open/0001-reopened-auto-review.md"
$cr-review-auto "0001"
$cr-ticket-implement ".coderail/tickets/open/0001-reopened-auto-review.md"
$cr-review-auto "0001"'
    assert_file "$work_dir/.coderail/tickets/closed/0001-reopened-auto-review.md"
    assert_no_unstaged_or_untracked_changes "$work_dir"
}

assert_loop_all_reprocesses_reopened_ticket() {
    work_dir=$(create_project reopened-auto-review-all)
    fake_dir=$tmp_dir/fake-reopened-auto-review-all

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-reopened-auto-review.md" 0001 reopened-auto-review "Reopened Auto Review" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_REVIEW_RESULT=reopen-once \
        run_loop_with_fake "$work_dir" "$fake_dir" --all --auto-review codex

    assert_success
    assert_line_count "$run_fake_agent_log" 4
    assert_file "$work_dir/.coderail/tickets/closed/0001-reopened-auto-review.md"
}

assert_loop_schedules_review_follow_up() {
    work_dir=$(create_project auto-review-follow-up)
    fake_dir=$tmp_dir/fake-auto-review-follow-up
    follow_up=$work_dir/.coderail/tickets/open/0002-review-follow-up.md

    write_fake_agent "$fake_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-auto-review-source.md" 0001 auto-review-source "Auto Review Source" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_REVIEW_RESULT=follow-up \
        run_loop_with_fake "$work_dir" "$fake_dir" --max 1 --auto-review codex

    assert_success
    assert_file "$work_dir/.coderail/tickets/closed/0001-auto-review-source.md"
    assert_file "$follow_up"
    assert_contains "$follow_up" "dependencies: 0001"
    next_ticket=$("$CR" --cwd "$work_dir" ticket next)
    [ "$next_ticket" = ".coderail/tickets/open/0002-review-follow-up.md" ] ||
        fail "follow-up was not selected by ticket next"

    commit_all "$work_dir" "Checkpoint review follow-up"
    run_loop_with_fake "$work_dir" "$fake_dir" --all codex

    assert_success
    assert_file "$work_dir/.coderail/tickets/closed/0002-review-follow-up.md"
}

assert_loop_stops_on_auto_review_failure_without_staging() {
    work_dir=$(create_project auto-review-agent-failure)
    fake_dir=$tmp_dir/fake-auto-review-agent-failure

    write_fake_agent "$fake_dir"
    write_loop_ignore "$work_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-auto-review-agent-failure.md" 0001 auto-review-agent-failure "Auto Review Agent Failure" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_FAIL_ON=2 \
        run_loop_with_fake "$work_dir" "$fake_dir" --all --auto-review codex

    assert_failure
    assert_line_count "$run_fake_agent_log" 2
    assert_contains "$run_stderr" "agent failed for ticket: 0001"
    assert_no_staged_changes "$work_dir"
    assert_file "$work_dir/.coderail/tickets/closed/0001-auto-review-agent-failure.md"
    assert_file "$work_dir/work-1.txt"
}

assert_loop_rejects_active_auto_review_ticket_without_staging() {
    work_dir=$(create_project active-auto-review-ticket)
    fake_dir=$tmp_dir/fake-active-auto-review-ticket

    write_fake_agent "$fake_dir"
    write_loop_ignore "$work_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-active-auto-review.md" 0001 active-auto-review "Active Auto Review" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_REVIEW_RESULT=active \
        run_loop_with_fake "$work_dir" "$fake_dir" --all --auto-review codex

    assert_failure
    assert_line_count "$run_fake_agent_log" 2
    assert_no_staged_changes "$work_dir"
    assert_file "$work_dir/.coderail/tickets/active/0001-active-auto-review.md"
}

assert_loop_rejects_invalid_auto_review_ticket_without_staging() {
    work_dir=$(create_project invalid-auto-review-ticket)
    fake_dir=$tmp_dir/fake-invalid-auto-review-ticket

    write_fake_agent "$fake_dir"
    write_loop_ignore "$work_dir"
    write_ticket "$work_dir/.coderail/tickets/open/0001-invalid-auto-review.md" 0001 invalid-auto-review "Invalid Auto Review" open "" ""
    commit_all "$work_dir" "Add ticket"

    FAKE_AGENT_REVIEW_RESULT=invalid \
        run_loop_with_fake "$work_dir" "$fake_dir" --all --auto-review codex

    assert_failure
    assert_line_count "$run_fake_agent_log" 2
    assert_no_staged_changes "$work_dir"
    assert_file "$work_dir/.coderail/tickets/open/0001-invalid-auto-review.md"
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

    FAKE_AGENT_CLOSE_REASON=dismissed \
        run_loop_with_fake "$work_dir" "$fake_dir" --all --auto-review codex

    assert_failure
    assert_line_count "$run_fake_agent_log" 1
    assert_contains "$run_stderr" "ticket was not closed as satisfied: 0001"
}

assert_loop_leaves_rejected_changes_unstaged() {
    work_dir=$(create_project rejected-unstaged)
    fake_dir=$tmp_dir/fake-rejected-unstaged

    write_fake_agent "$fake_dir"
    write_loop_ignore "$work_dir"
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

    FAKE_AGENT_CLOSE_REASON=deferred \
        run_loop_with_fake "$work_dir" "$fake_dir" --all --auto-review codex

    assert_failure
    assert_line_count "$run_fake_agent_log" 1
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

assert_loop_skips_auto_review_for_satisfied_duplicate() {
    work_dir=$(create_project auto-review-duplicate-close)
    fake_dir=$tmp_dir/fake-auto-review-duplicate-close

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
        run_loop_with_fake "$work_dir" "$fake_dir" --all --auto-review codex

    assert_success
    assert_line_count "$run_fake_agent_log" 1
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
test "Loop accepts auto review" assert_loop_accepts_auto_review
test "Loop rejects repeated max" assert_loop_rejects_repeated_max
test "Loop rejects repeated auto review" assert_loop_rejects_repeated_auto_review
test "Loop rejects all with max" assert_loop_rejects_all_with_max
test "Loop rejects missing max value" assert_loop_rejects_missing_max_value
test "Loop rejects invalid max value" assert_loop_rejects_invalid_max_value
test "Loop rejects unknown option" assert_loop_rejects_unknown_option
test "Loop rejects removed output dir" assert_loop_rejects_removed_output_dir
test "Loop rejects removed output dir equals" assert_loop_rejects_removed_output_dir_equals
test "Loop rejects removed progress only" assert_loop_rejects_removed_progress_only
test "Loop rejects unexpected argument" assert_loop_rejects_unexpected_argument
test "Loop accepts supported tools" assert_loop_accepts_supported_tools
test "Loop invokes supported tools noninteractively" assert_loop_invokes_supported_tools_noninteractively
test "Loop auto reviews supported tools" assert_loop_auto_reviews_supported_tools
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
test "Loop leaves setup absent without ready tickets" assert_loop_does_not_create_transcript_setup_without_ready_ticket
test "Loop writes mapped transcript" assert_loop_writes_mapped_transcript
test "Loop appends phase delimiters to reopened transcript" assert_loop_appends_phase_delimiters_to_reopened_transcript
test "Loop writes ignored transcripts for multiple tickets" assert_loop_writes_ignored_transcripts_for_multiple_tickets
test "Loop quiet writes transcript" assert_loop_quiet_writes_transcript
test "Loop reports ticket progress" assert_loop_reports_ticket_progress
test "Loop reports implementation failure progress" assert_loop_reports_implementation_failure_progress
test "Loop reports review failure progress" assert_loop_reports_review_failure_progress
test "Loop quiet suppresses ticket progress" assert_loop_quiet_suppresses_ticket_progress
test "Loop verbose reports operational notices" assert_loop_verbose_reports_operational_notices
test "Loop uses ready snapshot headings" assert_loop_uses_ready_snapshot_headings
test "Loop updates headings for reopened and follow-up tickets" assert_loop_updates_headings_for_reopened_and_follow_up_tickets
test "Loop stages new ignore before failed handoff" assert_loop_stages_new_ignore_before_failed_handoff
test "Loop force stages new ignore in ignored directory" assert_loop_force_stages_new_ignore_in_ignored_directory
test "Loop rejects unignored transcript" assert_loop_rejects_unignored_transcript
test "Loop stages post-agent changes" assert_loop_stages_post_agent_changes
test "Loop stages clean auto review" assert_loop_stages_clean_auto_review
test "Loop reimplements reopened ticket with max" assert_loop_reimplements_reopened_ticket_with_max
test "Loop all reprocesses reopened ticket" assert_loop_all_reprocesses_reopened_ticket
test "Loop schedules review follow-up" assert_loop_schedules_review_follow_up
test "Loop stops on auto review failure without staging" assert_loop_stops_on_auto_review_failure_without_staging
test "Loop rejects active auto review ticket without staging" assert_loop_rejects_active_auto_review_ticket_without_staging
test "Loop rejects invalid auto review ticket without staging" assert_loop_rejects_invalid_auto_review_ticket_without_staging
test "Loop rejects unsafe handoff state" assert_loop_rejects_unsafe_handoff_state
test "Loop accepts done closed ticket" assert_loop_accepts_done_closed_ticket
test "Loop rejects open ticket" assert_loop_rejects_open_ticket
test "Loop rejects active ticket" assert_loop_rejects_active_ticket
test "Loop rejects unsatisfied closed ticket" assert_loop_rejects_unsatisfied_closed_ticket
test "Loop leaves rejected changes unstaged" assert_loop_leaves_rejected_changes_unstaged
test "Loop rejects deferred closed ticket" assert_loop_rejects_deferred_closed_ticket
test "Loop accepts duplicate closed to done" assert_loop_accepts_duplicate_closed_to_done
test "Loop skips auto review for satisfied duplicate" assert_loop_skips_auto_review_for_satisfied_duplicate
test "Loop rejects duplicate closed to unsatisfied" assert_loop_rejects_duplicate_closed_to_unsatisfied

print_tests_summary

if some_tests_failed; then
    exit 1
fi
