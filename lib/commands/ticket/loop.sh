#!/usr/bin/env sh

set -eu

script_path=$0

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$script_path")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../../.."
    pwd
)

. "$ROOT_DIR/lib/utils/log.sh"
. "$ROOT_DIR/lib/utils/loop.sh"
. "$ROOT_DIR/lib/utils/ticket.sh"

CR=${CODERAIL_BIN_PATH:-$ROOT_DIR/bin/cr}

usage() {
    cat <<'EOF'
Usage:
  cr ticket loop [options] [<tool>] [-- <tool-args>...]

  Loop through open tickets with satisfied dependencies for the current repository.

  ** DANGER!: ** This command runs agent cli tool with extended permissions and network access.

Options:
  -h, --help        Show this help message and exit
  -m <count>, --max <count>
                    Maximum number of tickets to loop through. Must be a
                    positive integer.
                    (default: 5)
  --all             Loop through all open tickets with satisfied dependencies.
  --drift-check <cadence>
                    Reconcile discovery drift: never, each, end, or a
                    positive integer.
                    (default: each)
  --auto-review     Run an autonomous review after each ticket closes as done.
  --no-auto-review  Do not run autonomous reviews after tickets close as done.

Arguments:
  <tool>      The agent cli tool to use for tickets. If not specified, the
              default configured will be used.
  <tool-args> Additional arguments passed directly to the agent cli tool.
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

fatal() {
    log_error "$@"
    exit 1
}

format_duration() {
    format_duration_seconds=$1
    format_duration_minutes=$((format_duration_seconds / 60))
    format_duration_remaining_seconds=$((format_duration_seconds % 60))

    printf '%02d:%02d\n' \
        "$format_duration_minutes" \
        "$format_duration_remaining_seconds"
}

elapsed_duration() {
    elapsed_duration_started_at=$1
    elapsed_duration_now=$(date +%s)
    elapsed_duration_seconds=$((elapsed_duration_now - elapsed_duration_started_at))

    format_duration "$elapsed_duration_seconds"
}

has_unstaged_or_untracked_changes() {
    [ "$#" -eq 1 ] || fatal "has_unstaged_or_untracked_changes expects 1 argument"

    printf '%s\n' "$1" |
        awk '
            $0 == "" { next }
            substr($0, 1, 2) == "??" { found = 1 }
            substr($0, 2, 1) != " " { found = 1 }
            END { exit found ? 0 : 1 }
        '
}

require_initial_clean_worktree() {
    if ! initial_git_status=$(git status --porcelain 2>/dev/null); then
        fatal "ticket loop requires a git repository"
    fi

    [ -z "$initial_git_status" ] ||
        fatal "ticket loop requires a clean git worktree before starting: staged, unstaged, or untracked changes present"
}

require_handoff_clean_worktree() {
    if ! handoff_git_status=$(git status --porcelain 2>/dev/null); then
        fatal "ticket loop requires a git repository"
    fi

    if has_unstaged_or_untracked_changes "$handoff_git_status"; then
        fatal "ticket loop handoff requires no unstaged or untracked changes"
    fi
}

select_next_ticket() {
    select_next_stdout=$tmp_dir/next.stdout
    select_next_stderr=$tmp_dir/next.stderr

    set +e
    "$CR" ticket next > "$select_next_stdout" 2> "$select_next_stderr"
    select_next_status=$?
    set -e

    if [ "$select_next_status" -eq 0 ]; then
        next_ticket=$(sed -n '1p' "$select_next_stdout")
        [ -n "$next_ticket" ] ||
            fatal "ticket next returned no ticket"
        ready_ticket_count=$(wc -l < "$select_next_stdout" | tr -d ' ')
        return 0
    fi

    if grep -Fx "no available tickets" "$select_next_stdout" >/dev/null &&
        [ ! -s "$select_next_stderr" ]
    then
        next_ticket=
        return 1
    fi

    select_next_error=$(cat "$select_next_stderr")
    [ -n "$select_next_error" ] ||
        select_next_error=$(cat "$select_next_stdout")
    fatal "failed to select next ticket: $select_next_error"
}

require_ticket_closed_satisfied() {
    require_ticket_closed_id=$1
    require_ticket_closed_visited=$(mktemp "$tmp_dir/closed.XXXXXX")

    if ticket_closed_is_satisfied \
        "$project_dir" \
        "$require_ticket_closed_id" \
        "$require_ticket_closed_visited"
    then
        return 0
    else
        require_ticket_closed_status=$?
    fi

    [ "$require_ticket_closed_status" -eq 1 ] || exit 1
    fatal "ticket was not closed as satisfied: $require_ticket_closed_id"
}

ticket_close_reason() {
    ticket_close_reason_id=$1
    ticket_close_reason_path=$(ticket_resolve_reference "$project_dir" "$ticket_close_reason_id") ||
        return 1
    ticket_close_reason_file=$project_dir/$ticket_close_reason_path

    _ticket_frontmatter_value "$ticket_close_reason_file" close_reason
}

require_auto_review_ticket_state() {
    require_auto_review_id=$1
    require_auto_review_path=$(ticket_resolve_reference "$project_dir" "$require_auto_review_id") ||
        fatal "failed to resolve ticket after auto review: $require_auto_review_id"
    require_auto_review_file=$project_dir/$require_auto_review_path

    ticket_validate_file "$project_dir" "$require_auto_review_file" ||
        fatal "ticket is invalid after auto review: $require_auto_review_id"

    if ticket_is_state "$require_auto_review_file" closed; then
        require_ticket_closed_satisfied "$require_auto_review_id"
        return 0
    fi

    if ticket_is_state "$require_auto_review_file" open; then
        return 0
    fi

    fatal "ticket must be open or closed after auto review: $require_auto_review_id"
}

stage_post_agent_changes() {
    git add --all ||
        fatal "failed to stage post-agent changes"
}

invoke_agent() {
    invoke_ticket=$1
    invoke_prompt_kind=$2
    shift 2

    case "$invoke_prompt_kind" in
        implementation)
            prompt_name=cr-ticket-implement
            ;;
        review)
            prompt_name=cr-review-auto
            ;;
        drift)
            prompt_name=cr-drift
            ;;
        *)
            fatal "unknown ticket loop prompt kind: $invoke_prompt_kind"
            ;;
    esac

    case "$tool" in
        codex)
            if [ "$invoke_prompt_kind" = drift ]; then
                prompt='$'"$prompt_name"
            else
                prompt='$'"$prompt_name"' @"'"$invoke_ticket"'"'
            fi
            "$tool" --sandbox workspace-write \
                -c 'sandbox_workspace_write.network_access=true' \
                exec "$@" "$prompt"
            ;;
        claude)
            if [ "$invoke_prompt_kind" = drift ]; then
                prompt='/'"$prompt_name"
            else
                prompt='/'"$prompt_name"' @"'"$invoke_ticket"'"'
            fi
            "$tool" --dangerously-skip-permissions "$@" -p "$prompt"
            ;;
        gemini)
            if [ "$invoke_prompt_kind" = drift ]; then
                prompt='/'"$prompt_name"
            else
                prompt='/'"$prompt_name"' @"'"$invoke_ticket"'"'
            fi
            "$tool" --approval-mode=yolo "$@" -p "$prompt"
            ;;
        copilot)
            if [ "$invoke_prompt_kind" = drift ]; then
                prompt='/'"$prompt_name"
            else
                prompt='/'"$prompt_name"' @"'"$invoke_ticket"'"'
            fi
            "$tool" --yolo "$@" -p "$prompt"
            ;;
    esac
}

prepare_transcript() {
    prepare_transcript_ticket=$1
    prepare_transcript_stage_ignore=$2
    prepare_transcript_base=${prepare_transcript_ticket##*/}
    transcript_file=.coderail/loop/${prepare_transcript_base%.md}.txt

    transcript_outer_ignore_changed=$(loop_ensure_outer_ignore "$project_dir") ||
        fatal "failed to ensure ticket loop ignore policy"

    if [ "$prepare_transcript_stage_ignore" = true ] &&
        [ "$transcript_outer_ignore_changed" = true ]; then
        git add -- .coderail/.gitignore ||
            fatal "failed to stage ticket loop ignore file"
    fi

    loop_create_directory "$project_dir" ||
        fatal "failed to create ticket loop transcript directory"

    git check-ignore -q -- "$transcript_file" ||
        fatal "ticket loop transcript is not ignored: $transcript_file"
}

run_drift_check() {
    discovery_file=.coderail/DISCOVERY.md

    log_notice "ticket loop checking for discovery drift"
    if [ ! -e "$discovery_file" ] && [ ! -L "$discovery_file" ]; then
        log_info "         no discovery document found, skipping drift check"
        return 0
    fi

    prepare_transcript drift false
    append_phase_delimiter drift

    log_notice "ticket loop reconciling discovery drift"
    if ! invoke_agent_to_transcript "" drift "$@"; then
        fatal "drift reconciliation agent failed"
    fi

    if ! discovery_state=$(loop_discovery_state "$discovery_file"); then
        fatal "discovery resolution contract is invalid"
    fi

    case "$discovery_state" in
        resolved)
            rm -- "$discovery_file" ||
                fatal "failed to remove resolved discovery document"
            stage_post_agent_changes
            ;;
        unresolved)
            stage_post_agent_changes
            fatal "discovery reconciliation requires user input"
            ;;
        *)
            fatal "unknown discovery resolution state: $discovery_state"
            ;;
    esac
}

run_exit_drift_check() {
    case "$drift_check" in
        end)
            run_drift_check "$@"
            ;;
        *[!0123456789]*|'')
            ;;
        *)
            if [ "$drift_count" -gt 0 ]; then
                run_drift_check "$@"
                drift_count=0
            fi
            ;;
    esac
}

append_phase_delimiter() {
    append_phase=$1

    printf '\n--- %s %s ---\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$append_phase" >> "$transcript_file" ||
        fatal "failed to append ticket loop transcript delimiter: $transcript_file"
}

invoke_agent_to_transcript() {
    invoke_agent_ticket=$1
    invoke_agent_prompt_kind=$2
    shift 2

    invoke_agent "$invoke_agent_ticket" "$invoke_agent_prompt_kind" "$@" >> "$transcript_file" 2>&1
}

print_ticket_block() {
    print_ticket_block_heading=$1
    print_ticket_block_title=$2
    print_ticket_block_ticket=$3

    log_info "$print_ticket_block_heading $print_ticket_block_title"
    log_info "         file: $print_ticket_block_ticket"
    log_info "         inspect: tail -f $transcript_file"
}

set_max() {
    [ "$max_set" = false ] || error "--max provided multiple times"
    [ "$all_tickets" = false ] || error "--all and --max cannot be used together"

    case "$1" in
        ''|*[!0123456789]*)
            error "--max must be a positive integer"
            ;;
        0)
            error "--max must be a positive integer"
            ;;
    esac

    max=$1
    max_set=true
}

set_all() {
    [ "$all_tickets" = false ] || error "--all provided multiple times"
    [ "$max_set" = false ] || error "--all and --max cannot be used together"

    all_tickets=true
}

set_auto_review() {
    [ "$auto_review_set" = false ] || error "review option provided multiple times"

    auto_review=$1
    auto_review_set=true
}

set_drift_check() {
    [ "$drift_check_set" = false ] || error "--drift-check provided multiple times"

    case "$1" in
        never|each|end)
            ;;
        ''|*[!0123456789]*|0)
            error "--drift-check must be never, each, end, or a positive integer"
            ;;
    esac

    drift_check=$1
    drift_check_set=true
}

set_tool() {
    [ -z "$tool" ] || error "unexpected argument: $1"

    case "$1" in
        codex|copilot|claude|gemini)
            ;;
        *)
            error "unknown tool: $1"
            ;;
    esac

    tool=$1
}

max=5
max_set=false
all_tickets=false
auto_review=${auto_review:-false}
auto_review_set=false
drift_check=each
drift_check_set=false
tool=
has_tool_args=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --max=*)
            set_max "${1#--max=}"
            shift
            ;;
        -m|--max)
            max_option=$1
            shift
            [ "$#" -gt 0 ] || error "$max_option requires a value"
            set_max "$1"
            shift
            ;;
        --all)
            set_all
            shift
            ;;
        --drift-check=)
            error "--drift-check requires a value"
            ;;
        --drift-check=*)
            set_drift_check "${1#--drift-check=}"
            shift
            ;;
        --drift-check)
            shift
            [ "$#" -gt 0 ] || error "--drift-check requires a value"
            set_drift_check "$1"
            shift
            ;;
        --auto-review)
            set_auto_review true
            shift
            ;;
        --no-auto-review)
            set_auto_review false
            shift
            ;;
        --)
            shift
            has_tool_args=true
            break
            ;;
        --*)
            error "unknown option: $1"
            ;;
        -*)
            error "unknown option: $1"
            ;;
        *)
            set_tool "$1"
            shift
            ;;
    esac
done

if [ "$has_tool_args" = false ]; then
    while [ "$#" -gt 0 ]; do
        set_tool "$1"
        shift
    done
fi

if [ -z "$tool" ]; then
    default_tool=${default_tool:-}
    [ -n "$default_tool" ] || error "missing tool"
    set_tool "$default_tool"
fi

project_dir=.

TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-loop.XXXXXX")

cleanup() {
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

require_initial_clean_worktree

log_notice "ticket loop tool: $tool"

if [ "$all_tickets" = true ]; then
    log_notice "ticket loop max: all"
else
    log_notice "ticket loop max: $max"
fi

processed_count=0
drift_count=0

if [ "$drift_check" != never ]; then
    run_drift_check "$@"
fi

while :; do
    if [ "$all_tickets" = false ] && [ "$processed_count" -ge "$max" ]; then
        run_exit_drift_check "$@"
        exit 0
    fi

    if [ "$processed_count" -gt 0 ]; then
        require_handoff_clean_worktree
    fi

    log_notice "ticket loop selecting next ticket"
    if ! select_next_ticket; then
        if [ "$drift_check" = end ]; then
            run_drift_check "$@"
            log_notice "ticket loop selecting next ticket"
            if ! select_next_ticket; then
                exit 0
            fi
        else
            run_exit_drift_check "$@"
            exit 0
        fi
    fi

    next_ticket_id=$(ticket_id_from_name "$next_ticket")
    next_ticket_title=$(_ticket_frontmatter_value "$project_dir/$next_ticket" title) ||
        fatal "failed to read ticket title: $next_ticket"
    ticket_started_at=$(date +%s)

    if [ "$all_tickets" = true ]; then
        ticket_heading="[$((processed_count + 1))]"
    else
        ticket_total=$((processed_count + ready_ticket_count))
        if [ "$ticket_total" -gt "$max" ]; then
            ticket_total=$max
        fi
        ticket_heading="[$((processed_count + 1))/$ticket_total]"
    fi

    log_notice "ticket loop selected ticket: $next_ticket"
    prepare_transcript "$next_ticket" true
    append_phase_delimiter implementation
    print_ticket_block "$ticket_heading" "$next_ticket_title" "$next_ticket"

    log_info "         implementing..."
    implementation_started_at=$(date +%s)
    if ! invoke_agent_to_transcript "$next_ticket" implementation "$@"; then
        implementation_duration=$(elapsed_duration "$implementation_started_at")
        log_info "         implementation failed in $implementation_duration"
        fatal "agent failed for ticket: $next_ticket"
    fi
    implementation_duration=$(elapsed_duration "$implementation_started_at")
    log_info "         implementation done in $implementation_duration"

    log_notice "ticket loop validating ticket closure: $next_ticket_id"
    require_ticket_closed_satisfied "$next_ticket_id"
    log_notice "ticket loop confirmed satisfied closure: $next_ticket_id"

    if [ "$auto_review" = true ]; then
        next_ticket_close_reason=$(ticket_close_reason "$next_ticket_id") ||
            fatal "failed to determine ticket close reason: $next_ticket_id"

        if [ "$next_ticket_close_reason" = done ]; then
            append_phase_delimiter review
            review_started_at=$(date +%s)
            log_info "         reviewing..."
            if ! invoke_agent_to_transcript "$next_ticket_id" review "$@"; then
                review_duration=$(elapsed_duration "$review_started_at")
                log_info "         review failed in $review_duration"
                fatal "agent failed for ticket: $next_ticket_id"
            fi
            review_duration=$(elapsed_duration "$review_started_at")
            log_info "         review done in $review_duration"

            require_auto_review_ticket_state "$next_ticket_id"
        fi
    fi

    log_notice "ticket loop staging post-agent changes"
    stage_post_agent_changes

    processed_count=$((processed_count + 1))

    case "$drift_check" in
        each)
            run_drift_check "$@"
            ;;
        *[!0123456789]*|'')
            ;;
        *)
            drift_count=$((drift_count + 1))
            if [ "$drift_count" -ge "$drift_check" ]; then
                run_drift_check "$@"
                drift_count=0
            fi
            ;;
    esac

    ticket_duration=$(elapsed_duration "$ticket_started_at")
    log_info "         completed in $ticket_duration"
done
