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
  cr ticket create [options] <name>

  Create a new open ticket for the current repository.

Options:
  -h, --help            Show this help message and exit
  -d <ticket>, --depends-on <ticket>
                        Specify a ticket that this new ticket depends on. Can be
                        specified multiple times to add multiple dependencies.
                        Accepts ticket ID, name, or path.

Arguments:
  <name>                The name of the ticket to create
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

add_dependency() {
    [ -n "$1" ] || error "--depends-on requires a non-empty value"

    if [ -n "$depends_on" ]; then
        depends_on="${depends_on}
$1"
    else
        depends_on=$1
    fi
}

set_ticket_name() {
    [ -z "$ticket_name" ] || error "unexpected argument: $1"
    [ -n "$1" ] || error "<name> requires a non-empty value"

    ticket_name=$1
}

depends_on=
ticket_name=

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --depends-on=*)
            add_dependency "${1#--depends-on=}"
            shift
            ;;
        -d|--depends-on)
            shift
            [ "$#" -gt 0 ] || error "--depends-on requires a value"
            add_dependency "$1"
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
            set_ticket_name "$1"
            shift
            ;;
    esac
done

while [ "$#" -gt 0 ]; do
    set_ticket_name "$1"
    shift
done

[ -n "$ticket_name" ] || error "missing name"

project_dir=.
tickets_dir=$project_dir/.coderail/tickets
open_tickets_dir=$tickets_dir/open

TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-create.XXXXXX")

cleanup() {
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

ids_file=$tmp_dir/ids
depends_on_file=$tmp_dir/depends-on
resolved_depends_on_file=$tmp_dir/resolved-depends-on

: > "$ids_file"
: > "$depends_on_file"
: > "$resolved_depends_on_file"

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

require_ticket_directory() {
    [ -d "$tickets_dir" ] ||
        fatal "ticket directory not found: .coderail/tickets; run cr init before proceeding"

    mkdir -p "$open_tickets_dir" ||
        fatal "failed to create ticket directory: .coderail/tickets/open"
}

collect_ticket_ids() {
    for ticket_state in open active closed; do
        ticket_state_dir=$tickets_dir/$ticket_state
        [ -d "$ticket_state_dir" ] || continue

        for ticket_file in "$ticket_state_dir"/*.md; do
            [ -f "$ticket_file" ] || continue

            ticket_base=$(basename "$ticket_file")
            ticket_id=$(ticket_id_from_name "$ticket_base" 2>/dev/null) ||
                fatal "invalid ticket filename: .coderail/tickets/$ticket_state/$ticket_base"
            printf '%s\n' "$ticket_id" >> "$ids_file"
        done
    done
}

next_ticket_id() {
    if [ -s "$ids_file" ]; then
        highest_ticket_id=$(sort -n "$ids_file" | tail -n 1)
    else
        highest_ticket_id=0000
    fi

    awk -v id="$highest_ticket_id" '
        BEGIN {
            next_id = id + 1
            if (next_id < 10000) {
                printf "%04d\n", next_id
            } else {
                printf "%d\n", next_id
            }
        }
    '
}

resolve_dependencies() {
    [ -n "$depends_on" ] || return 0

    printf '%s\n' "$depends_on" > "$depends_on_file"

    while IFS= read -r dependency_reference || [ -n "$dependency_reference" ]; do
        dependency_path=$(ticket_resolve_reference "$project_dir" "$dependency_reference")
        dependency_id=$(ticket_id_from_name "$dependency_path")
        append_unique_line "$resolved_depends_on_file" "$dependency_id"
    done < "$depends_on_file"
}

dependency_list() {
    awk '
        NF {
            if (value) {
                value = value ", " $0
            } else {
                value = $0
            }
        }
        END { print value }
    ' "$resolved_depends_on_file"
}

write_ticket_file() {
    write_ticket_file_path=$1
    write_ticket_rel_path=$2
    write_ticket_id=$3
    write_ticket_slug=$4
    write_ticket_title=$5
    write_ticket_dependencies=$6
    write_ticket_created_at=$7

    if ! cat > "$write_ticket_file_path" <<EOF
---
id: $write_ticket_id
slug: $write_ticket_slug
title: $write_ticket_title
status: open
created_at: $write_ticket_created_at
updated_at: $write_ticket_created_at
dependencies: $write_ticket_dependencies
---

# $write_ticket_title
EOF
    then
        rm -f "$write_ticket_file_path"
        fatal "failed to create ticket file: $write_ticket_rel_path"
    fi
}

require_ticket_directory
resolve_dependencies
collect_ticket_ids

ticket_id=$(next_ticket_id)
ticket_slug=$(ticket_slugify_title "$ticket_name")
ticket_base=$ticket_id-$ticket_slug.md
ticket_rel_path=.coderail/tickets/open/$ticket_base
ticket_file=$project_dir/$ticket_rel_path
ticket_dependencies=$(dependency_list)
created_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

[ ! -e "$ticket_file" ] ||
    fatal "target ticket already exists: $ticket_rel_path"

write_ticket_file \
    "$ticket_file" \
    "$ticket_rel_path" \
    "$ticket_id" \
    "$ticket_slug" \
    "$ticket_name" \
    "$ticket_dependencies" \
    "$created_at"

if ! ticket_validate_file "$project_dir" "$ticket_file"; then
    rm -f "$ticket_file"
    exit 1
fi

printf '%s\n' "$ticket_rel_path"
