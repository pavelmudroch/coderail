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
  cr ticket close [options] <ticket>

  Close an active ticket for the current repository.

Options:
  -h, --help            Show this help message and exit
  --reason <reason>
                        The reason for closing the ticket. Can be one of:
                        done, duplicate, deferred, dismissed
                        (default: done)
  --duplicate-of <ticket>
                        Specify the ticket that this ticket is a duplicate of.
                        Accepts ticket ID, name, or path.
                        (Required if --reason is duplicate)

Arguments:
  <ticket>    The ticket to close, specified by its ID, name, or path
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

set_close_reason() {
    [ "$close_reason_set" = false ] || error "--reason provided multiple times"

    case "$1" in
        done|duplicate|deferred|dismissed)
            close_reason=$1
            close_reason_set=true
            ;;
        *)
            error "invalid close reason: $1"
            ;;
    esac
}

set_duplicate_of_reference() {
    [ -z "$duplicate_of_reference" ] || error "--duplicate-of provided multiple times"
    [ -n "$1" ] || error "--duplicate-of requires a non-empty value"

    duplicate_of_reference=$1
}

set_ticket_reference() {
    [ -z "$ticket_reference" ] || error "unexpected argument: $1"
    [ -n "$1" ] || error "<ticket> requires a non-empty value"

    ticket_reference=$1
}

close_reason=done
close_reason_set=false
duplicate_of_reference=
ticket_reference=

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --reason=*)
            set_close_reason "${1#--reason=}"
            shift
            ;;
        --reason)
            shift
            [ "$#" -gt 0 ] || error "--reason requires a value"
            set_close_reason "$1"
            shift
            ;;
        --duplicate-of=*)
            set_duplicate_of_reference "${1#--duplicate-of=}"
            shift
            ;;
        --duplicate-of)
            shift
            [ "$#" -gt 0 ] || error "--duplicate-of requires a value"
            set_duplicate_of_reference "$1"
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

if [ "$close_reason" = duplicate ]; then
    [ -n "$duplicate_of_reference" ] ||
        error "--duplicate-of is required when --reason is duplicate"
else
    [ -z "$duplicate_of_reference" ] ||
        error "--duplicate-of requires --reason duplicate"
fi

project_dir=.
tickets_dir=$project_dir/.coderail/tickets
closed_tickets_dir=$tickets_dir/closed

TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-close.XXXXXX")

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

frontmatter_value() {
    frontmatter_value_file=$1
    frontmatter_value_key=$2

    awk -v key="$frontmatter_value_key" '
        BEGIN { found = 1 }
        NR == 1 && $0 == "---" { in_frontmatter = 1; next }
        NR == 1 { exit 1 }
        in_frontmatter && $0 == "---" { exit found }
        in_frontmatter && index($0, key ":") == 1 {
            value = substr($0, length(key) + 2)
            sub(/^[[:space:]]*/, "", value)
            print value
            found = 0
            exit
        }
        END { exit found }
    ' "$frontmatter_value_file"
}

ticket_dependencies() {
    ticket_dependencies_file=$1
    ticket_dependencies_value=$(frontmatter_value "$ticket_dependencies_file" dependencies)

    printf '%s\n' "$ticket_dependencies_value" | tr ',' '\n' |
        while IFS= read -r ticket_dependencies_item || [ -n "$ticket_dependencies_item" ]; do
            ticket_dependencies_item=$(trim "$ticket_dependencies_item")
            [ -n "$ticket_dependencies_item" ] || continue
            printf '%s\n' "$ticket_dependencies_item"
        done
}

require_ticket_directory() {
    [ -d "$tickets_dir" ] ||
        fatal "ticket directory not found: .coderail/tickets; run cr init before proceeding"
}

resolve_ticket_id() {
    resolve_ticket_id_reference=$1
    resolve_ticket_id_path=$(ticket_resolve_reference "$project_dir" "$resolve_ticket_id_reference") ||
        return 1

    ticket_id_from_name "$resolve_ticket_id_path"
}

resolve_duplicate_of() {
    [ "$close_reason" = duplicate ] || return 0

    log_notice "resolving duplicate target: $duplicate_of_reference"
    duplicate_of_id=$(resolve_ticket_id "$duplicate_of_reference")

    [ "$duplicate_of_id" != "$ticket_id" ] ||
        fatal "ticket cannot be a duplicate of itself: $ticket_id"

    log_notice "resolved duplicate target: $duplicate_of_id"
}

dependency_is_satisfied() {
    dependency_is_satisfied_id=$1
    dependency_is_satisfied_visited=$2

    while :; do
        if line_exists "$dependency_is_satisfied_visited" "$dependency_is_satisfied_id"; then
            fatal "duplicate dependency cycle: $dependency_is_satisfied_id"
        fi
        append_unique_line "$dependency_is_satisfied_visited" "$dependency_is_satisfied_id"

        dependency_is_satisfied_path=$(ticket_resolve_reference "$project_dir" "$dependency_is_satisfied_id") ||
            return 1
        dependency_is_satisfied_file=$project_dir/$dependency_is_satisfied_path

        ticket_validate_file "$project_dir" "$dependency_is_satisfied_file" || return 1

        if ! ticket_is_state "$dependency_is_satisfied_file" closed; then
            return 1
        fi

        dependency_is_satisfied_reason=$(frontmatter_value "$dependency_is_satisfied_file" close_reason) ||
            return 1

        case "$dependency_is_satisfied_reason" in
            done)
                return 0
                ;;
            duplicate)
                dependency_is_satisfied_id=$(frontmatter_value "$dependency_is_satisfied_file" duplicate_of) ||
                    return 1
                ;;
            *)
                return 1
                ;;
        esac
    done
}

check_done_dependencies() {
    [ "$close_reason" = done ] || return 0

    log_notice "checking dependencies for done close: $ticket_path"
    ticket_dependencies "$ticket_file" > "$tmp_dir/dependencies"
    dependency_counter=0

    while IFS= read -r dependency_id || [ -n "$dependency_id" ]; do
        [ -n "$dependency_id" ] || continue

        log_notice "checking dependency: $dependency_id"
        dependency_counter=$((dependency_counter + 1))
        dependency_visited=$tmp_dir/dependency-$dependency_counter.visited
        : > "$dependency_visited"

        dependency_is_satisfied "$dependency_id" "$dependency_visited" ||
            fatal "dependency is not satisfied: $dependency_id"
        log_notice "dependency satisfied: $dependency_id"
    done < "$tmp_dir/dependencies"
}

rewrite_closed_ticket() {
    rewrite_closed_file=$1
    rewrite_closed_updated_at=$2
    rewrite_closed_tmp=$rewrite_closed_file.tmp.$$

    if ! awk \
        -v updated_at="$rewrite_closed_updated_at" \
        -v close_reason="$close_reason" \
        -v duplicate_of_id="$duplicate_of_id" '
            NR == 1 && $0 == "---" {
                in_frontmatter = 1
                print
                next
            }
            NR == 1 { exit 1 }
            in_frontmatter && $0 == "---" {
                found_end = 1
                print "close_reason: " close_reason
                if (close_reason == "duplicate") {
                    print "duplicate_of: " duplicate_of_id
                }
                print
                in_frontmatter = 0
                next
            }
            in_frontmatter && index($0, "status:") == 1 {
                found_status = 1
                print "status: closed"
                next
            }
            in_frontmatter && index($0, "updated_at:") == 1 {
                found_updated_at = 1
                print "updated_at: " updated_at
                next
            }
            in_frontmatter &&
                (index($0, "close_reason:") == 1 || index($0, "duplicate_of:") == 1) {
                next
            }
            { print }
            END {
                if (!found_end || !found_status || !found_updated_at) {
                    exit 1
                }
            }
        ' "$rewrite_closed_file" > "$rewrite_closed_tmp"
    then
        rm -f "$rewrite_closed_tmp"
        fatal "ticket lifecycle fields are not writable: $ticket_path"
    fi

    if ! mv "$rewrite_closed_tmp" "$rewrite_closed_file"; then
        rm -f "$rewrite_closed_tmp"
        fatal "failed to update ticket file: $ticket_path"
    fi
}

close_ticket() {
    close_ticket_base=$(basename "$ticket_file")
    closed_ticket_path=.coderail/tickets/closed/$close_ticket_base
    closed_ticket_file=$project_dir/$closed_ticket_path

    mkdir -p "$closed_tickets_dir" ||
        fatal "failed to create ticket directory: .coderail/tickets/closed"

    [ ! -e "$closed_ticket_file" ] ||
        fatal "target ticket already exists: $closed_ticket_path"

    rewrite_closed_ticket "$ticket_file" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

    mv "$ticket_file" "$closed_ticket_file" ||
        fatal "failed to move ticket to $closed_ticket_path"

    ticket_validate_file "$project_dir" "$closed_ticket_file"

    printf '%s\n' "$closed_ticket_path"
}

duplicate_of_id=

require_ticket_directory

log_notice "locating ticket: $ticket_reference"
ticket_path=$(ticket_resolve_reference "$project_dir" "$ticket_reference")
ticket_file=$project_dir/$ticket_path
ticket_id=$(ticket_id_from_name "$ticket_path")
log_notice "located ticket: $ticket_path"

log_notice "validating ticket: $ticket_path"
ticket_validate_file "$project_dir" "$ticket_file"

log_notice "verifying active ticket: $ticket_path"
if ! ticket_is_state "$ticket_file" active; then
    fatal "ticket must be active: $ticket_path"
fi
log_notice "verified active ticket: $ticket_path"

resolve_duplicate_of
check_done_dependencies

log_notice "closing ticket as $close_reason: $ticket_path"
closed_ticket_path=$(close_ticket)
log_notice "closed ticket: $closed_ticket_path"

printf '%s\n' "$closed_ticket_path"
