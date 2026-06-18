#!/usr/bin/env sh

set -eu

usage() {
    cat <<'EOF'
Usage:
  cr ticket [options] <command>

  Ticket management for the project in the working directory

Options:
  --help                Show this help message and exit

Commands:
  create <title>
  next [--limit=N]
  open <id | name | path>
  close <id | name | path> --reason=<done | duplicate | dismissed | deferred>
  activate <id | name | path>
  reopen <id | name | path>
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 1
}

require_not_option() {
    case "$1" in
        --*) error "unexpected option: $1" ;;
    esac
}

require_title() {
    [ "$#" -gt 0 ] || error "missing title"
    [ "$#" -eq 1 ] || error "unexpected argument: $2"
    [ -n "$1" ] || error "missing title"
    require_not_option "$1"
}

require_reference() {
    [ "$#" -gt 0 ] || error "missing ticket reference"
    [ "$#" -eq 1 ] || error "unexpected argument: $2"
    [ -n "$1" ] || error "missing ticket reference"
    require_not_option "$1"
}

set_limit() {
    [ -n "$1" ] || error "--limit requires a value"

    case "$1" in
        *[!0123456789]*)
            error "--limit requires a number"
            ;;
    esac
}

set_reason() {
    [ -n "$1" ] || error "--reason requires a value"

    case "$1" in
        done|duplicate|dismissed|deferred)
            ;;
        *)
            error "unsupported reason: $1"
            ;;
    esac
}

argument_count=$#

[ "$#" -gt 0 ] || error "missing ticket command"

case "$1" in
    --help)
        [ "$argument_count" -eq 1 ] || error "--help must be the only argument"
        usage
        exit 0
        ;;
    --help=*)
        error "--help does not accept a value"
        ;;
    create)
        shift
        require_title "$@"
        ;;
    next)
        shift
        case "$#" in
            0)
                ;;
            1)
                case "$1" in
                    --limit=*)
                        set_limit "${1#--limit=}"
                        ;;
                    --limit)
                        error "--limit requires a value"
                        ;;
                    --*)
                        error "unknown option: $1"
                        ;;
                    *)
                        error "unexpected argument: $1"
                        ;;
                esac
                ;;
            *)
                error "unexpected argument: $2"
                ;;
        esac
        ;;
    open|activate|reopen)
        shift
        require_reference "$@"
        ;;
    close)
        shift
        [ "$#" -gt 0 ] || error "missing ticket reference"
        [ -n "$1" ] || error "missing ticket reference"
        require_not_option "$1"
        [ "$#" -gt 1 ] || error "missing reason"
        [ "$#" -eq 2 ] || error "unexpected argument: $3"

        case "$2" in
            --reason=*)
                set_reason "${2#--reason=}"
                ;;
            --reason)
                error "--reason requires a value"
                ;;
            --*)
                error "unknown option: $2"
                ;;
            *)
                error "unexpected argument: $2"
                ;;
        esac
        ;;
    --*)
        error "unknown option: $1"
        ;;
    *)
        error "unknown ticket command: $1"
        ;;
esac

:
