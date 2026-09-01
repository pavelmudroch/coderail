#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr idea ready [options] <idea_path>

  Mark an idea as ready. An idea status is changed to 'ready'. Only currently
  forging ideas can be marked as ready.

Options:
  -h, --help           Show this help message and exit

Arguments:
  <idea_path>          Path of the idea to mark as ready
EOF
}

execute_command()
{
    while [ $# -gt 0 ]; do
        case "$1" in
            -h|--help)
                usage
                exit "$SUCCESS_EXIT_CODE"
                ;;
            --help=*)
                log_error "--help does not take an argument"
                usage >&2
                exit "$USAGE_EXIT_CODE"
                ;;
            --)
                break
                shift
                ;;
            *)
                break
                ;;
        esac
        shift
    done

    if [ $# -ne 1 ]; then
        log_error "Exactly one idea path must be provided"
        usage >&2
        exit "$USAGE_EXIT_CODE"
    fi

    idea_path="$1"
    if ! idea_path="$( _normalize_idea_path "$idea_path" )"; then
        log_error "Invalid idea path: $idea_path"
        exit "$ERROR_EXIT_CODE"
    fi
    if ! status="$(_get_idea_status "$idea_path")"; then
        log_error "Cannot read idea status: $status"
        exit "$ERROR_EXIT_CODE"
    fi
    if [ "$status" != "$IDEA_STATUS_FORGING" ]; then
        log_error "Only forging ideas can be marked as ready. Current status: $status"
        exit "$ERROR_EXIT_CODE"
    fi

    idea_file=$(_get_idea_file "$idea_path")
    if ! idea_content=$(cat "$idea_file"); then
        log_error "Cannot read idea content: $error"
        return 1
    fi

}