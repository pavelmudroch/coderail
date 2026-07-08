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
  cr ticket validate [options] [<ticket> ...]

  Validate the format of tickets for the current repository.

Options:
  -h, --help            Show this help message and exit

Arguments:
  <ticket>    The ticket(s) to validate, specified by their ID, name, or path.
              If no tickets are specified, all tickets will be validated.
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

add_ticket_reference() {
    [ -n "$1" ] || error "<ticket> requires a non-empty value"

    if [ -n "$ticket_references" ]; then
        ticket_references="${ticket_references}
$1"
    else
        ticket_references=$1
    fi

    ticket_reference_count=$((ticket_reference_count + 1))
}

ticket_references=
ticket_reference_count=0

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
            add_ticket_reference "$1"
            shift
            ;;
    esac
done

while [ "$#" -gt 0 ]; do
    add_ticket_reference "$1"
    shift
done

project_dir=.
tickets_dir=$project_dir/.coderail/tickets

TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-validate.XXXXXX")

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

add_issue() {
    printf '%s\n' "$1" >> "$issues_file"
}

frontmatter_value_or_issue() {
    frontmatter_value_key=$1

    if _ticket_has_frontmatter_key "$ticket_file" "$frontmatter_value_key"; then
        _ticket_frontmatter_value "$ticket_file" "$frontmatter_value_key"
        return 0
    fi

    add_issue "missing ticket field: $frontmatter_value_key"
    return 1
}

ticket_dependencies() {
    ticket_dependencies_value=$1

    printf '%s\n' "$ticket_dependencies_value" | tr ',' '\n' |
        while IFS= read -r ticket_dependencies_item || [ -n "$ticket_dependencies_item" ]; do
            ticket_dependencies_item=$(trim "$ticket_dependencies_item")
            [ -n "$ticket_dependencies_item" ] || continue
            printf '%s\n' "$ticket_dependencies_item"
        done
}

dependency_is_satisfied() {
    dependency_is_satisfied_id=$1
    dependency_is_satisfied_visited=$2

    while :; do
        if line_exists "$dependency_is_satisfied_visited" "$dependency_is_satisfied_id"; then
            add_issue "duplicate dependency cycle: $dependency_is_satisfied_id"
            return 1
        fi
        append_unique_line "$dependency_is_satisfied_visited" "$dependency_is_satisfied_id"

        dependency_is_satisfied_path=$(
            ticket_resolve_reference "$project_dir" "$dependency_is_satisfied_id" 2>/dev/null
        ) || return 1
        dependency_is_satisfied_file=$project_dir/$dependency_is_satisfied_path

        dependency_is_satisfied_status=$(
            _ticket_frontmatter_value "$dependency_is_satisfied_file" status 2>/dev/null
        ) || return 1

        if [ "$dependency_is_satisfied_status" != closed ]; then
            return 1
        fi

        dependency_is_satisfied_reason=$(
            _ticket_frontmatter_value "$dependency_is_satisfied_file" close_reason 2>/dev/null
        ) || return 1

        case "$dependency_is_satisfied_reason" in
            done)
                return 0
                ;;
            duplicate)
                dependency_is_satisfied_id=$(
                    _ticket_frontmatter_value "$dependency_is_satisfied_file" duplicate_of 2>/dev/null
                ) || return 1
                ;;
            *)
                return 1
                ;;
        esac
    done
}

validate_required_fields() {
    if ticket_id=$(frontmatter_value_or_issue id); then ticket_has_id=true; else ticket_has_id=false; ticket_id=; fi
    if ticket_slug=$(frontmatter_value_or_issue slug); then ticket_has_slug=true; else ticket_has_slug=false; ticket_slug=; fi
    if ticket_title=$(frontmatter_value_or_issue title); then ticket_has_title=true; else ticket_has_title=false; ticket_title=; fi
    if ticket_status=$(frontmatter_value_or_issue status); then ticket_has_status=true; else ticket_has_status=false; ticket_status=; fi
    if ticket_created_at=$(frontmatter_value_or_issue created_at); then ticket_has_created_at=true; else ticket_has_created_at=false; ticket_created_at=; fi
    if ticket_updated_at=$(frontmatter_value_or_issue updated_at); then ticket_has_updated_at=true; else ticket_has_updated_at=false; ticket_updated_at=; fi
    if ticket_dependency_list=$(frontmatter_value_or_issue dependencies); then ticket_has_dependencies=true; else ticket_has_dependencies=false; ticket_dependency_list=; fi
}

validate_id() {
    [ "$ticket_has_id" = true ] || return 0

    case "$ticket_id" in
        ''|*[!0123456789]*)
            add_issue "invalid ticket id: $ticket_id"
            return
            ;;
    esac

    [ "${#ticket_id}" -ge 4 ] ||
        add_issue "ticket id must have at least 4 digits: $ticket_id"

    case "$ticket_id" in
        *[123456789]*) ;;
        *) add_issue "ticket id must be positive: $ticket_id" ;;
    esac
}

validate_title_and_slug() {
    [ "$ticket_has_title" = false ] || [ -n "$ticket_title" ] ||
        add_issue "ticket title must not be empty"
    [ "$ticket_has_slug" = false ] || [ -n "$ticket_slug" ] ||
        add_issue "ticket slug must not be empty"

    [ "$ticket_has_title" = true ] || return 0
    [ "$ticket_has_slug" = true ] || return 0
    [ -n "$ticket_title" ] || return 0
    [ -n "$ticket_slug" ] || return 0

    if expected_slug=$(ticket_slugify_title "$ticket_title" 2>/dev/null); then
        [ "$ticket_slug" = "$expected_slug" ] ||
            add_issue "ticket slug must match title: $expected_slug"
    else
        add_issue "ticket title cannot be slugified: $ticket_title"
    fi
}

validate_timestamps() {
    [ "$ticket_has_created_at" = false ] || [ -n "$ticket_created_at" ] ||
        add_issue "ticket created_at must not be empty"
    [ "$ticket_has_updated_at" = false ] || [ -n "$ticket_updated_at" ] ||
        add_issue "ticket updated_at must not be empty"
}

validate_status() {
    [ "$ticket_has_status" = true ] || return 0

    _ticket_valid_state "$ticket_status" ||
        add_issue "invalid ticket status: $ticket_status"
}

validate_filename() {
    [ "$ticket_has_id" = true ] || return 0
    [ "$ticket_has_slug" = true ] || return 0
    [ -n "$ticket_id" ] || return 0
    [ -n "$ticket_slug" ] || return 0

    ticket_base=$(basename "$ticket_path")
    expected_base=$ticket_id-$ticket_slug.md

    [ "$ticket_base" = "$expected_base" ] ||
        add_issue "ticket filename must match id and slug: $expected_base"
}

validate_path_status() {
    _ticket_valid_state "$ticket_status" || return 0

    ticket_state_dir=$(basename "$(dirname "$ticket_path")")

    [ "$ticket_state_dir" = "$ticket_status" ] ||
        add_issue "ticket path does not match status: $ticket_status"
}

validate_lifecycle() {
    has_close_reason=false
    close_reason=
    if _ticket_has_frontmatter_key "$ticket_file" close_reason; then
        has_close_reason=true
        close_reason=$(_ticket_frontmatter_value "$ticket_file" close_reason)
    fi

    has_duplicate_of=false
    duplicate_of=
    if _ticket_has_frontmatter_key "$ticket_file" duplicate_of; then
        has_duplicate_of=true
        duplicate_of=$(_ticket_frontmatter_value "$ticket_file" duplicate_of)
    fi

    case "$ticket_status" in
        open|active)
            [ "$has_close_reason" = false ] ||
                add_issue "open and active tickets must not have close_reason"
            [ "$has_duplicate_of" = false ] ||
                add_issue "open and active tickets must not have duplicate_of"
            ;;
        closed)
            if [ "$has_close_reason" = false ]; then
                add_issue "closed tickets must have close_reason"
                return
            fi

            case "$close_reason" in
                done|duplicate|deferred|dismissed) ;;
                *) add_issue "invalid close reason: $close_reason" ;;
            esac

            if [ "$close_reason" = duplicate ]; then
                if [ "$has_duplicate_of" = false ]; then
                    add_issue "duplicate tickets must have duplicate_of"
                    return
                fi

                if [ -z "$duplicate_of" ]; then
                    add_issue "duplicate_of must not be empty"
                    return
                fi

                if duplicate_of_path=$(ticket_resolve_reference "$project_dir" "$duplicate_of" 2>/dev/null); then
                    duplicate_of_id=$(ticket_id_from_name "$duplicate_of_path")
                    [ "$duplicate_of_id" != "$ticket_id" ] ||
                        add_issue "ticket cannot be a duplicate of itself: $ticket_id"
                else
                    add_issue "duplicate ticket target not found: $duplicate_of"
                fi
            else
                [ "$has_duplicate_of" = false ] ||
                    add_issue "duplicate_of is only valid for duplicate tickets"
            fi
            ;;
    esac
}

validate_dependencies() {
    [ "$ticket_has_dependencies" = true ] || return 0
    [ -n "$ticket_dependency_list" ] || return 0

    ticket_dependencies "$ticket_dependency_list" > "$tmp_dir/dependencies"

    while IFS= read -r dependency_reference || [ -n "$dependency_reference" ]; do
        [ -n "$dependency_reference" ] || continue

        log_notice "checking dependency: $dependency_reference"
        if dependency_path=$(
            ticket_resolve_reference "$project_dir" "$dependency_reference" 2>/dev/null
        ); then
            dependency_id=$(ticket_id_from_name "$dependency_path")
            [ "$dependency_id" != "$ticket_id" ] ||
                add_issue "ticket cannot depend on itself: $ticket_id"
        else
            add_issue "dependency not found: $dependency_reference"
        fi
    done < "$tmp_dir/dependencies"
}

validate_done_dependencies() {
    [ "$ticket_status" = closed ] || return 0
    [ "$close_reason" = done ] || return 0
    [ "$ticket_has_dependencies" = true ] || return 0
    [ -n "$ticket_dependency_list" ] || return 0

    ticket_dependencies "$ticket_dependency_list" > "$tmp_dir/done-dependencies"

    while IFS= read -r dependency_reference || [ -n "$dependency_reference" ]; do
        [ -n "$dependency_reference" ] || continue

        if ! ticket_resolve_reference "$project_dir" "$dependency_reference" >/dev/null 2>&1; then
            continue
        fi

        log_notice "checking satisfied dependency: $dependency_reference"
        dependency_visited=$(mktemp "$tmp_dir/dependency.XXXXXX")

        dependency_is_satisfied "$dependency_reference" "$dependency_visited" ||
            add_issue "dependency is not satisfied: $dependency_reference"
    done < "$tmp_dir/done-dependencies"
}

validate_ticket() {
    ticket_path=$1
    ticket_file=$project_dir/$ticket_path
    issues_file=$tmp_dir/issues

    : > "$issues_file"

    log_notice "checking ticket: $ticket_path"

    if [ ! -f "$ticket_file" ]; then
        add_issue "ticket file not found: $ticket_path"
        print_ticket_result "$ticket_path"
        return 1
    fi

    log_notice "checking frontmatter: $ticket_path"
    if ! _ticket_has_frontmatter "$ticket_file"; then
        add_issue "ticket frontmatter is missing or unterminated"
        print_ticket_result "$ticket_path"
        return 1
    fi

    validate_required_fields

    log_notice "checking identity: $ticket_path"
    validate_id
    validate_title_and_slug
    validate_filename

    log_notice "checking state: $ticket_path"
    validate_status
    validate_path_status

    log_notice "checking lifecycle: $ticket_path"
    validate_timestamps
    validate_lifecycle

    log_notice "checking dependencies: $ticket_path"
    validate_dependencies
    validate_done_dependencies

    print_ticket_result "$ticket_path"
}

print_ticket_result() {
    print_ticket_result_path=$1

    if [ -s "$issues_file" ]; then
        printf '%s is invalid\n' "$print_ticket_result_path"
        cat "$issues_file"
        return 1
    fi

    printf '%s is valid\n' "$print_ticket_result_path"
}

collect_all_tickets() {
    [ -d "$tickets_dir" ] ||
        fatal "ticket directory not found: .coderail/tickets; run cr init before proceeding"

    for ticket_state in open active closed; do
        ticket_state_dir=$tickets_dir/$ticket_state
        [ -d "$ticket_state_dir" ] || continue

        for ticket_file in "$ticket_state_dir"/*.md; do
            [ -f "$ticket_file" ] || continue

            ticket_base=$(basename "$ticket_file")
            printf '.coderail/tickets/%s/%s\n' "$ticket_state" "$ticket_base"
        done
    done
}

resolve_error_file=$tmp_dir/resolve-error
ticket_paths_file=$tmp_dir/ticket-paths
ticket_references_file=$tmp_dir/ticket-references
some_tickets_invalid=false

if [ "$ticket_reference_count" -eq 0 ]; then
    collect_all_tickets > "$ticket_paths_file"
else
    printf '%s\n' "$ticket_references" > "$ticket_references_file"
    : > "$ticket_paths_file"

    while IFS= read -r ticket_reference || [ -n "$ticket_reference" ]; do
        [ -n "$ticket_reference" ] || continue

        log_notice "locating ticket: $ticket_reference"
        if ticket_path=$(ticket_resolve_reference "$project_dir" "$ticket_reference" 2>"$resolve_error_file"); then
            printf '%s\n' "$ticket_path" >> "$ticket_paths_file"
            log_notice "located ticket: $ticket_path"
        else
            log_notice "checking ticket: $ticket_reference"
            printf '%s is invalid\n' "$ticket_reference"
            sed 's/^error: //' "$resolve_error_file"
            some_tickets_invalid=true
        fi
    done < "$ticket_references_file"
fi

while IFS= read -r ticket_path || [ -n "$ticket_path" ]; do
    [ -n "$ticket_path" ] || continue

    if ! validate_ticket "$ticket_path"; then
        some_tickets_invalid=true
    fi
done < "$ticket_paths_file"

[ "$some_tickets_invalid" = false ] || exit 1
