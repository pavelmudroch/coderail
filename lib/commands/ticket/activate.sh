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
  cr ticket activate [options] <ticket>

  Activate an open ticket for the current repository.

Options:
  -h, --help            Show this help message and exit

Arguments:
  <ticket>    The ticket to activate, specified by its ID, name, or path
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

set_ticket_reference() {
    [ -z "$ticket_reference" ] || error "unexpected argument: $1"
    [ -n "$1" ] || error "<ticket> requires a non-empty value"

    ticket_reference=$1
}

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

dependency_is_satisfied() {
    dependency_reference=$1
    dependency_visited=$2

    while :; do
        dependency_path=$(ticket_resolve_reference "$project_dir" "$dependency_reference") ||
            return 1
        dependency_file=$project_dir/$dependency_path

        if line_exists "$dependency_visited" "$dependency_path"; then
            fatal "duplicate dependency cycle: $dependency_path"
        fi
        append_unique_line "$dependency_visited" "$dependency_path"

        ticket_validate_file "$project_dir" "$dependency_file" || return 1

        if ! ticket_is_state "$dependency_file" closed; then
            return 1
        fi

        dependency_reason=$(_ticket_frontmatter_value "$dependency_file" close_reason) ||
            return 1

        case "$dependency_reason" in
            done)
                return 0
                ;;
            duplicate)
                dependency_reference=$(_ticket_frontmatter_value "$dependency_file" duplicate_of) ||
                    return 1
                ;;
            *)
                return 1
                ;;
        esac
    done
}

check_dependencies() {
    log_notice "checking dependencies: $ticket_path"
    ticket_dependencies "$ticket_file" > "$tmp_dir/dependencies"
    dependency_counter=0

    while IFS= read -r dependency_reference || [ -n "$dependency_reference" ]; do
        [ -n "$dependency_reference" ] || continue

        log_notice "checking dependency: $dependency_reference"
        dependency_counter=$((dependency_counter + 1))
        dependency_visited=$tmp_dir/dependency-$dependency_counter.visited
        : > "$dependency_visited"

        dependency_is_satisfied "$dependency_reference" "$dependency_visited" ||
            fatal "dependency is not satisfied: $dependency_reference"
        log_notice "dependency satisfied: $dependency_reference"
    done < "$tmp_dir/dependencies"
}

ticket_reference=

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
            set_ticket_reference "$1"
            shift
            ;;
    esac
done

while [ "$#" -gt 0 ]; do
    set_ticket_reference "$1"
    shift
done

[ -n "$ticket_reference" ] || error "missing ticket"

project_dir=.

TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-activate.XXXXXX")

cleanup() {
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

log_notice "locating ticket: $ticket_reference"
ticket_path=$(ticket_resolve_reference "$project_dir" "$ticket_reference")
ticket_file=$project_dir/$ticket_path
log_notice "located ticket: $ticket_path"

log_notice "validating ticket: $ticket_path"
ticket_validate_file "$project_dir" "$ticket_file"

log_notice "verifying open ticket: $ticket_path"
if ! ticket_is_state "$ticket_file" open; then
    log_error "ticket must be open: $ticket_path"
    exit 1
fi
log_notice "verified open ticket: $ticket_path"

check_dependencies

log_notice "moving ticket to active: $ticket_path"
active_ticket_path=$(ticket_move_to_state "$project_dir" "$ticket_file" active)
log_notice "activated ticket: $active_ticket_path"

printf '%s\n' "$active_ticket_path"
