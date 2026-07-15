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
. "$ROOT_DIR/lib/utils/ticket.sh"

usage() {
    cat <<'EOF'
Usage:
  cr ticket next [options]

  List open tickets with satisfied dependencies for the current repository.

Options:
  -h, --help            Show this help message and exit
  --limit <N>           Limit the number of tickets to display, must be
                        a positive integer
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

set_limit() {
    [ "$limit_set" = false ] || error "--limit provided multiple times"

    case "$1" in
        ''|*[!0123456789]*)
            error "--limit must be a positive integer"
            ;;
        0)
            error "--limit must be a positive integer"
            ;;
    esac

    limit=$1
    limit_set=true
}

limit=
limit_set=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --limit=*)
            set_limit "${1#--limit=}"
            shift
            ;;
        --limit)
            shift
            [ "$#" -gt 0 ] || error "--limit requires a value"
            set_limit "$1"
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
            break
            ;;
    esac
done

[ "$#" -eq 0 ] || error "unexpected argument: $1"

project_dir=.
tickets_dir=$project_dir/.coderail/tickets
open_tickets_dir=$tickets_dir/open

require_coderail_directory() {
    [ -d "$project_dir/.coderail" ] ||
        fatal "coderail directory not found: .coderail; run cr init before proceeding"
}

require_coderail_directory

TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-next.XXXXXX")

cleanup() {
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

trim() {
    printf '%s\n' "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

line_exists() {
    line_exists_file=$1
    line_exists_value=$2

    [ -f "$line_exists_file" ] || return 1

    while IFS= read -r line_exists_line || [ -n "$line_exists_line" ]; do
        [ "$line_exists_line" = "$line_exists_value" ] && return 0
    done < "$line_exists_file"

    return 1
}

append_unique_line() {
    append_unique_file=$1
    append_unique_value=$2

    line_exists "$append_unique_file" "$append_unique_value" ||
        printf '%s\n' "$append_unique_value" >> "$append_unique_file"
}

ticket_path_from_file() {
    ticket_path_from_file_state=$1
    ticket_path_from_file_file=$2
    ticket_path_from_file_base=$(basename "$ticket_path_from_file_file")

    printf '.coderail/tickets/%s/%s\n' \
        "$ticket_path_from_file_state" \
        "$ticket_path_from_file_base"
}

ticket_dependencies() {
    ticket_dependencies_file=$1
    ticket_dependencies_value=$(_ticket_frontmatter_value "$ticket_dependencies_file" dependencies)

    printf '%s\n' "$ticket_dependencies_value" | tr ',' '\n' |
        while IFS= read -r ticket_dependencies_item || [ -n "$ticket_dependencies_item" ]; do
            ticket_dependencies_item=$(trim "$ticket_dependencies_item")
            [ -n "$ticket_dependencies_item" ] || continue
            printf '%s\n' "$ticket_dependencies_item"
        done
}

resolve_ticket_path() {
    resolve_ticket_reference=$1

    ticket_resolve_reference "$project_dir" "$resolve_ticket_reference" 2>"$resolve_error_file"
}

fatal_resolve_ticket() {
    resolve_ticket_error=$(sed 's/^error: //' "$resolve_error_file")
    fatal "$resolve_ticket_error"
}

closed_ticket_is_satisfied() {
    closed_ticket_reference=$1
    closed_ticket_visited=$2

    while :; do
        closed_ticket_path=$(resolve_ticket_path "$closed_ticket_reference") ||
            fatal_resolve_ticket
        closed_ticket_file=$project_dir/$closed_ticket_path

        if line_exists "$closed_ticket_visited" "$closed_ticket_path"; then
            fatal "duplicate dependency cycle: $closed_ticket_path"
        fi
        append_unique_line "$closed_ticket_visited" "$closed_ticket_path"

        if ! ticket_validate_file "$project_dir" "$closed_ticket_file"; then
            exit 1
        fi

        if ! ticket_is_state "$closed_ticket_file" closed; then
            return 1
        fi

        closed_ticket_reason=$(_ticket_frontmatter_value "$closed_ticket_file" close_reason) ||
            fatal "closed tickets must have close_reason"

        case "$closed_ticket_reason" in
            done)
                return 0
                ;;
            duplicate)
                closed_ticket_reference=$(_ticket_frontmatter_value "$closed_ticket_file" duplicate_of) ||
                    fatal "duplicate tickets must have duplicate_of"
                ;;
            *)
                return 1
                ;;
        esac
    done
}

ticket_is_available() {
    ticket_available_path=$1
    ticket_available_file=$project_dir/$ticket_available_path
    ticket_available_dependencies=$tmp_dir/$(basename "$ticket_available_path").dependencies

    if ! ticket_validate_file "$project_dir" "$ticket_available_file"; then
        exit 1
    fi

    if ! ticket_dependencies "$ticket_available_file" > "$ticket_available_dependencies"; then
        exit 1
    fi

    while IFS= read -r ticket_available_dependency ||
        [ -n "$ticket_available_dependency" ]; do
        [ -n "$ticket_available_dependency" ] || continue

        ticket_available_visited=$(mktemp "$tmp_dir/dependency.XXXXXX")

        if ! closed_ticket_is_satisfied \
            "$ticket_available_dependency" \
            "$ticket_available_visited"
        then
            return 1
        fi
    done < "$ticket_available_dependencies"

    return 0
}

resolve_error_file=$tmp_dir/resolve-error
available_count=0

: > "$resolve_error_file"

if [ -d "$open_tickets_dir" ]; then
    for ticket_file in "$open_tickets_dir"/*.md; do
        [ -f "$ticket_file" ] || continue

        ticket_path=$(ticket_path_from_file open "$ticket_file")
        log_notice "checking ticket: $ticket_path"

        if ticket_is_available "$ticket_path"; then
            printf '%s\n' "$ticket_path"
            available_count=$((available_count + 1))

            if [ -n "$limit" ] && [ "$available_count" -ge "$limit" ]; then
                exit 0
            fi
        fi
    done
fi

if [ "$available_count" -eq 0 ]; then
    printf 'no available tickets\n'
    exit 1
fi
