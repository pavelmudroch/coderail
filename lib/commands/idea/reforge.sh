#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr idea reforge [options] <idea_path>

  Reforge an idea which has been previously marked as ready.

Options:
  -h, --help           Show this help message and exit

Arguments:
  <idea_path>          Path of the idea to reforge
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
    if idea_path="$( _normalize_idea_path "$idea_path" )"; then
        :
    else
        log_error "Invalid idea path: $idea_path"
        exit "$USAGE_EXIT_CODE"
    fi

}