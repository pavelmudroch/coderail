#!/usr/bin/env sh

set -eu

script_path=$0

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$script_path")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../.."
    pwd
)

usage() {
    cat <<'EOF'
Usage:
  cr work <command>

  Management helper for new work (feature/fix/...) on current repository.

Options:
  -h, --help            Show this help message and exit

Commands:
  start                 Starts the new work
  finish                Complete the finished work
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

fatal() {
    echo "error: $*" >&2
    exit 1
}

run_work_command() {
    work_command=$1
    shift
    work_script=$SCRIPT_DIR/work/$work_command.sh

    [ -f "$work_script" ] || error "$work_command is not implemented"

    sh "$work_script" "$@"
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
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
            break
            ;;
    esac
done

[ "$#" -gt 0 ] || error "missing command"

work_command=$1
shift

case "$work_command" in
    start|finish)
        run_work_command "$work_command" "$@"
        ;;
    *)
        error "unknown command: $work_command"
        ;;
esac
