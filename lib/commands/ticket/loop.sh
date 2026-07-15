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
. "$ROOT_DIR/lib/utils/config.sh"
. "$ROOT_DIR/lib/utils/ticket.sh"

CR=${CODERAIL_BIN_PATH:-$ROOT_DIR/bin/cr}

usage() {
    cat <<'EOF'
Usage:
  cr ticket loop [options] [<tool>]

  Loop through open tickets with satisfied dependencies for the current repository.

Options:
  -h, --help            Show this help message and exit
  -m <count>, --max <count>
                        Maximum number of tickets to loop through. Must be a
                        positive integer.
                        (default: 5)
  --all                 Loop through all open tickets with satisfied dependencies.
  --output-dir <directory>
                        Write one combined agent stdout/stderr log per ticket
                        under the directory.
  --progress-only       Print Coderail handoff progress and discard agent
                        stdout/stderr.

Arguments:
  <tool>      The agent cli tool to use for tickets. If not specified, the
              default configured will be used.
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
    "$CR" ticket next --limit 1 > "$select_next_stdout" 2> "$select_next_stderr"
    select_next_status=$?
    set -e

    if [ "$select_next_status" -eq 0 ]; then
        next_ticket=$(sed -n '1p' "$select_next_stdout")
        [ -n "$next_ticket" ] ||
            fatal "ticket next returned no ticket"
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

stage_post_agent_changes() {
    git add --all ||
        fatal "failed to stage post-agent changes"
}

invoke_agent() {
    invoke_ticket=$1

    case "$tool" in
        codex)
            prompt='$ticket-implement "'"$invoke_ticket"'"'
            "$tool" exec "$prompt"
            ;;
        copilot|claude|gemini)
            prompt='/ticket-implement "'"$invoke_ticket"'"'
            "$tool" -p "$prompt"
            ;;
    esac
}

print_handoff() {
    print_handoff_ticket=$1

    if [ "$progress_only" = true ]; then
        log_info "ticket loop handoff: $print_handoff_ticket"
    else
        log_notice "ticket loop handoff: $print_handoff_ticket"
    fi
}

invoke_agent_with_routing() {
    invoke_agent_ticket=$1

    if [ "$output_dir_set" = true ]; then
        invoke_agent "$invoke_agent_ticket" > "$output_log_file" 2>&1
    elif [ "$log_quiet" = 1 ] || [ "$progress_only" = true ]; then
        invoke_agent "$invoke_agent_ticket" > /dev/null 2>&1
    else
        invoke_agent "$invoke_agent_ticket"
    fi
}

prepare_output_dir() {
    if [ -e "$output_dir" ] && [ ! -d "$output_dir" ]; then
        fatal "--output-dir is not a directory: $output_dir"
    fi

    if [ ! -e "$output_dir" ]; then
        mkdir -p "$output_dir" ||
            fatal "failed to create --output-dir: $output_dir"
    fi
}

prepare_output_log_file() {
    prepare_output_ticket=$1
    output_log_file=

    [ "$output_dir_set" = true ] || return 0

    prepare_output_dir

    output_log_base=${prepare_output_ticket##*/}
    output_log_file=$output_dir/${output_log_base%.md}.log

    [ ! -e "$output_log_file" ] ||
        fatal "ticket loop output log already exists: $output_log_file"

    if ! : > "$output_log_file"; then
        fatal "failed to create ticket loop output log: $output_log_file"
    fi
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

set_output_dir() {
    [ "$output_dir_set" = false ] || error "--output-dir provided multiple times"
    [ -n "$1" ] || error "--output-dir requires a non-empty value"
    [ "$progress_only" = false ] || error "--progress-only and --output-dir cannot be used together"

    output_dir=$1
    output_dir_set=true
}

set_progress_only() {
    [ "$progress_only" = false ] || error "--progress-only provided multiple times"
    [ "$output_dir_set" = false ] || error "--progress-only and --output-dir cannot be used together"

    progress_only=true
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
output_dir=
output_dir_set=false
progress_only=false
tool=

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
        --output-dir=*)
            set_output_dir "${1#--output-dir=}"
            shift
            ;;
        --output-dir)
            shift
            [ "$#" -gt 0 ] || error "--output-dir requires a value"
            set_output_dir "$1"
            shift
            ;;
        --progress-only)
            set_progress_only
            shift
            ;;
        --)
            shift
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

while [ "$#" -gt 0 ]; do
    set_tool "$1"
    shift
done

if [ -z "$tool" ]; then
    load_default_tool
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

while :; do
    if [ "$all_tickets" = false ] && [ "$processed_count" -ge "$max" ]; then
        exit 0
    fi

    if [ "$processed_count" -gt 0 ]; then
        require_handoff_clean_worktree
    fi

    if ! select_next_ticket; then
        exit 0
    fi

    next_ticket_id=$(ticket_id_from_name "$next_ticket")

    prepare_output_log_file "$next_ticket"

    print_handoff "$next_ticket"
    if ! invoke_agent_with_routing "$next_ticket"; then
        fatal "agent failed for ticket: $next_ticket"
    fi

    require_ticket_closed_satisfied "$next_ticket_id"
    stage_post_agent_changes

    processed_count=$((processed_count + 1))
done
