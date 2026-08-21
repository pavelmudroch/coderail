#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr idea [options] <command>

  Manage ideas.

Options:
  -h, --help           Show this help message and exit

Commands:
  map                  Generate map of ideas and their relationships
  create               Create a new idea
  validate             Validate an idea(s) for completeness and consistency
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
            map|create|validate)
                command="$1"
                shift
                break
                ;;
            *)
                log_error "Unknown argument: $1"
                usage >&2
                exit "$USAGE_EXIT_CODE"
                ;;
        esac
        shift
    done

    script="$ROOT_DIR/lib/commands/idea/$command.sh"
    (
        . "$script"
        execute_command "$@"
    )
}