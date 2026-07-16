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

. "$ROOT_DIR/lib/utils/ticket.sh"

usage() {
    cat <<'EOF'
Usage:
  cr clean [options]

  Clean stale Coderail workflow files from the current repository.

Options:
  -h, --help            Show this help message and exit
  --dry-run             Print planned removals without mutating files
  --force               Remove files without confirmation
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
    ticket_path_state=$1
    ticket_path_file=$2
    ticket_path_base=$(basename "$ticket_path_file")

    printf '.coderail/tickets/%s/%s\n' "$ticket_path_state" "$ticket_path_base"
}

collect_state_ticket_files() {
    collect_state_ticket_files_state=$1
    collect_state_ticket_files_output=$2
    collect_state_ticket_files_dir=$project_dir/.coderail/tickets/$collect_state_ticket_files_state

    [ -d "$collect_state_ticket_files_dir" ] || return 0

    for collect_state_ticket_files_file in "$collect_state_ticket_files_dir"/*.md; do
        [ -f "$collect_state_ticket_files_file" ] || continue

        ticket_path_from_file \
            "$collect_state_ticket_files_state" \
            "$collect_state_ticket_files_file" >> "$collect_state_ticket_files_output"
    done
}

collect_ticket_files() {
    collect_ticket_files_output=$1
    collect_ticket_files_unsorted=$tmp_dir/ticket-files-unsorted

    : > "$collect_ticket_files_unsorted"

    collect_state_ticket_files open "$collect_ticket_files_unsorted"
    collect_state_ticket_files active "$collect_ticket_files_unsorted"
    collect_state_ticket_files closed "$collect_ticket_files_unsorted"

    sort "$collect_ticket_files_unsorted" > "$collect_ticket_files_output"
}

validate_ticket_files() {
    while IFS= read -r validate_path || [ -n "$validate_path" ]; do
        [ -n "$validate_path" ] || continue

        ticket_validate_file "$project_dir" "$project_dir/$validate_path" || exit 1
    done < "$ticket_files"
}

ticket_is_resolved() {
    readiness_path=$1
    readiness_visited=$2
    readiness_file=$project_dir/$readiness_path

    if line_exists "$readiness_visited" "$readiness_path"; then
        fatal "duplicate ticket cycle: $readiness_path"
    fi
    append_unique_line "$readiness_visited" "$readiness_path"

    readiness_status=$(_ticket_frontmatter_value "$readiness_file" status) ||
        fatal "missing ticket field: status"

    case "$readiness_status" in
        open|active)
            fatal "$readiness_status tickets are not resolved: $readiness_path"
            ;;
        closed)
            ;;
        *)
            fatal "invalid ticket status: $readiness_status"
            ;;
    esac

    readiness_reason=$(_ticket_frontmatter_value "$readiness_file" close_reason) ||
        fatal "closed tickets must have close_reason"

    case "$readiness_reason" in
        done)
            return 0
            ;;
        duplicate)
            readiness_duplicate_of=$(_ticket_frontmatter_value "$readiness_file" duplicate_of) ||
                fatal "duplicate tickets must have duplicate_of"
            readiness_target_path=$(ticket_resolve_reference "$project_dir" "$readiness_duplicate_of") ||
                exit 1
            readiness_target_file=$project_dir/$readiness_target_path

            ticket_validate_file "$project_dir" "$readiness_target_file" || exit 1

            if ! ticket_is_state "$readiness_target_file" closed; then
                fatal "duplicate target is not closed: $readiness_target_path"
            fi

            ticket_is_resolved "$readiness_target_path" "$readiness_visited"
            ;;
        *)
            fatal "closed ticket is not resolved: $readiness_path"
            ;;
    esac
}

validate_ticket_readiness() {
    [ -s "$ticket_files" ] ||
        fatal "stale file cleanup requires at least one ticket file"

    validate_ticket_files

    while IFS= read -r readiness_path || [ -n "$readiness_path" ]; do
        [ -n "$readiness_path" ] || continue

        readiness_visited=$(mktemp "$tmp_dir/readiness.XXXXXX")
        ticket_is_resolved "$readiness_path" "$readiness_visited"
    done < "$ticket_files"
}

print_clean_plan() {
    while IFS= read -r print_path || [ -n "$print_path" ]; do
        [ -n "$print_path" ] || continue

        printf 'remove %s\n' "$print_path"
    done < "$stale_files"
}

apply_clean_plan() {
    while IFS= read -r apply_path || [ -n "$apply_path" ]; do
        [ -n "$apply_path" ] || continue

        rm -f "$project_dir/$apply_path" ||
            fatal "failed to remove stale file: $apply_path"
        printf 'remove %s\n' "$apply_path"
    done < "$stale_files"
}

collect_unsafe_stale_files() {
    : > "$unsafe_stale_files"

    git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
        fatal "failed to query Git index"

    while IFS= read -r safety_path || [ -n "$safety_path" ]; do
        [ -n "$safety_path" ] || continue

        if git ls-files --error-unmatch -- "$safety_path" >/dev/null 2>&1; then
            if git diff --quiet -- "$safety_path"; then
                continue
            else
                safety_status=$?
            fi
            [ "$safety_status" -eq 1 ] ||
                fatal "failed to query Git index: $safety_path"
        else
            safety_status=$?
            [ "$safety_status" -eq 1 ] ||
                fatal "failed to query Git index: $safety_path"
        fi

        printf '%s\n' "$safety_path" >> "$unsafe_stale_files"
    done < "$stale_files"
}

confirm_unsafe_stale_files() {
    [ -s "$unsafe_stale_files" ] || return 0
    [ "$force" = true ] && return 0

    echo "warning: the current content of the following files cannot be restored exactly from Git and will be permanently deleted:" >&2
    while IFS= read -r warning_path || [ -n "$warning_path" ]; do
        [ -n "$warning_path" ] || continue

        printf '  %s\n' "$warning_path" >&2
    done < "$unsafe_stale_files"
    printf 'Continue? [y/N] ' >&2

    if IFS= read -r confirmation && [ "$confirmation" = y ]; then
        return 0
    fi

    printf '\n' >&2
    fatal "cleanup aborted"
}

dry_run=false
force=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --dry-run)
            dry_run=true
            shift
            ;;
        --force)
            force=true
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
            error "unexpected argument: $1"
            ;;
    esac
done

[ "$#" -eq 0 ] || error "unexpected argument: $1"

[ -d .coderail ] ||
    fatal "coderail directory not found: .coderail; run cr init before proceeding"

project_dir=.
TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-clean.XXXXXX")

cleanup() {
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

stale_files=$tmp_dir/stale-files
ticket_files=$tmp_dir/ticket-files
unsafe_stale_files=$tmp_dir/unsafe-stale-files

find .coderail -type f \
    ! -path .coderail/conf.ini \
    ! -path .coderail/test.map \
    -print | sort > "$stale_files"

if [ ! -s "$stale_files" ]; then
    echo "nothing to clean"
    exit 0
fi

collect_ticket_files "$ticket_files"

if [ -s "$ticket_files" ]; then
    validate_ticket_readiness
elif [ "$dry_run" != true ]; then
    collect_unsafe_stale_files
    confirm_unsafe_stale_files
fi

if [ "$dry_run" = true ]; then
    print_clean_plan
    exit 0
fi

apply_clean_plan
