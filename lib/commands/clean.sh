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
    ! -path .coderail/work.ini \
    -print | sort > "$stale_files"

if [ ! -s "$stale_files" ]; then
    echo "nothing to clean"
    exit 0
fi

ticket_collect_files "$project_dir" "$ticket_files" "$tmp_dir"

if [ -s "$ticket_files" ]; then
    ticket_validate_all_resolved "$project_dir" "$ticket_files" "$tmp_dir" || exit 1
elif [ "$dry_run" != true ]; then
    collect_unsafe_stale_files
    confirm_unsafe_stale_files
fi

if [ "$dry_run" = true ]; then
    print_clean_plan
    exit 0
fi

apply_clean_plan
