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
  cr ticket clean [options]

  Deprecated: use cr clean instead.

  Clean up tickets for the current repository. Usefull for cleaning up a branch
  befor merging, or checking what tickets are still relevant and what is left
  to be done. Also removing dependencies for deleted closed tickets form open
  tickets.

  This command removes all closed tickets with close reason set to done, or set
  to duplicate, when the original ticket is closed with close reason done.

  Important: There must be no active tickets, otherwise this command will fail.

Options:
  -h, --help            Show this help message and exit
  --dry-run             Only print what would be done, without actually doing it
  --yes                 Do not prompt for confirmation
  --prune               Remove all closed tickets from the repository and also
                        any open tickets that depend on unsatisfied closed
                        ticket.
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

warn_deprecated_command() {
    [ "$log_quiet" = 1 ] && return

    echo "warning: cr ticket clean is deprecated; use cr clean next time" >&2
}

dry_run=false
yes=false
prune=false

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
        --yes)
            yes=true
            shift
            ;;
        --prune)
            prune=true
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

warn_deprecated_command

fatal() {
    log_error "$@"
    exit 1
}

project_dir=.
tickets_dir=$project_dir/.coderail/tickets

TEMP_DIR="${TMPDIR:-/tmp}"
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-ticket-clean.XXXXXX")

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

require_coderail_directory() {
    [ -d "$project_dir/.coderail" ] ||
        fatal "coderail directory not found: .coderail; run cr init before proceeding"
}

ticket_path_from_file() {
    ticket_path_from_file_state=$1
    ticket_path_from_file_file=$2
    ticket_path_from_file_base=$(basename "$ticket_path_from_file_file")

    printf '.coderail/tickets/%s/%s\n' \
        "$ticket_path_from_file_state" \
        "$ticket_path_from_file_base"
}

collect_state_tickets() {
    collect_state=$1
    collect_output=$2
    collect_dir=$tickets_dir/$collect_state

    : > "$collect_output"

    [ -d "$collect_dir" ] || return 0

    for collect_file in "$collect_dir"/*.md; do
        [ -f "$collect_file" ] || continue

        ticket_path_from_file "$collect_state" "$collect_file" >> "$collect_output"
    done
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

dependency_list() {
    dependency_list_file=$1

    awk '
        NF {
            if (value) {
                value = value ", " $0
            } else {
                value = $0
            }
        }
        END { print value }
    ' "$dependency_list_file"
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
    closed_ticket_id=$1
    closed_ticket_visited=$2

    if ticket_closed_is_satisfied "$project_dir" "$closed_ticket_id" "$closed_ticket_visited"; then
        return 0
    else
        closed_ticket_status=$?
    fi

    [ "$closed_ticket_status" -eq 1 ] || exit 1
    return 1
}

collect_normal_removed_tickets() {
    while IFS= read -r collect_normal_path || [ -n "$collect_normal_path" ]; do
        [ -n "$collect_normal_path" ] || continue

        collect_normal_id=$(ticket_id_from_name "$collect_normal_path")
        collect_normal_visited=$(mktemp "$tmp_dir/closed.XXXXXX")

        if closed_ticket_is_satisfied "$collect_normal_id" "$collect_normal_visited"; then
            append_unique_line "$normal_removed_file" "$collect_normal_path"
            append_unique_line "$normal_removed_ids_file" "$collect_normal_id"
        fi
    done < "$closed_tickets_file"
}

open_ticket_depends_on_unsatisfied_ticket() {
    open_depends_path=$1
    open_depends_file=$project_dir/$open_depends_path
    open_depends_deps=$(mktemp "$tmp_dir/open-deps.XXXXXX")

    ticket_validate_file "$project_dir" "$open_depends_file" || exit 1
    ticket_dependencies "$open_depends_file" > "$open_depends_deps"

    while IFS= read -r open_depends_reference || [ -n "$open_depends_reference" ]; do
        [ -n "$open_depends_reference" ] || continue

        open_depends_dependency_path=$(resolve_ticket_path "$open_depends_reference") ||
            fatal_resolve_ticket

        case "$open_depends_dependency_path" in
            .coderail/tickets/closed/*)
                open_depends_dependency_id=$(ticket_id_from_name "$open_depends_dependency_path")
                open_depends_visited=$(mktemp "$tmp_dir/prune-dependency.XXXXXX")

                if ! closed_ticket_is_satisfied \
                    "$open_depends_dependency_id" \
                    "$open_depends_visited"
                then
                    return 0
                fi
                ;;
            .coderail/tickets/open/*)
                if line_exists "$pruned_open_file" "$open_depends_dependency_path"; then
                    return 0
                fi
                ;;
        esac
    done < "$open_depends_deps"

    return 1
}

collect_pruned_open_tickets() {
    collect_pruned_changed=true

    while [ "$collect_pruned_changed" = true ]; do
        collect_pruned_changed=false

        while IFS= read -r collect_pruned_path || [ -n "$collect_pruned_path" ]; do
            [ -n "$collect_pruned_path" ] || continue
            line_exists "$pruned_open_file" "$collect_pruned_path" && continue

            if open_ticket_depends_on_unsatisfied_ticket "$collect_pruned_path"; then
                append_unique_line "$pruned_open_file" "$collect_pruned_path"
                collect_pruned_changed=true
            fi
        done < "$open_tickets_file"
    done
}

collect_ticket_ids() {
    collect_ids_input=$1
    collect_ids_output=$2

    : > "$collect_ids_output"

    while IFS= read -r collect_ids_path || [ -n "$collect_ids_path" ]; do
        [ -n "$collect_ids_path" ] || continue

        collect_ids_id=$(ticket_id_from_name "$collect_ids_path")
        append_unique_line "$collect_ids_output" "$collect_ids_id"
    done < "$collect_ids_input"
}

collect_prune_only_tickets() {
    while IFS= read -r collect_prune_only_path || [ -n "$collect_prune_only_path" ]; do
        [ -n "$collect_prune_only_path" ] || continue

        if ! line_exists "$normal_removed_file" "$collect_prune_only_path"; then
            append_unique_line "$prune_only_file" "$collect_prune_only_path"
        fi
    done < "$removed_file"
}

rewrite_dependencies() {
    rewrite_dependencies_path=$1
    rewrite_dependencies_file=$project_dir/$rewrite_dependencies_path
    rewrite_dependencies_deps=$(mktemp "$tmp_dir/rewrite-deps.XXXXXX")
    rewrite_dependencies_kept=$(mktemp "$tmp_dir/rewrite-kept.XXXXXX")
    rewrite_dependencies_removed=false

    : > "$rewrite_dependencies_kept"

    ticket_validate_file "$project_dir" "$rewrite_dependencies_file" || exit 1
    ticket_dependencies "$rewrite_dependencies_file" > "$rewrite_dependencies_deps"

    while IFS= read -r rewrite_dependencies_reference ||
        [ -n "$rewrite_dependencies_reference" ]; do
        [ -n "$rewrite_dependencies_reference" ] || continue

        rewrite_dependencies_dependency_path=$(resolve_ticket_path "$rewrite_dependencies_reference") ||
            fatal_resolve_ticket
        rewrite_dependencies_dependency_id=$(ticket_id_from_name "$rewrite_dependencies_dependency_path")

        case "$rewrite_dependencies_dependency_path" in
            .coderail/tickets/closed/*)
                if line_exists "$removed_dependency_ids_file" "$rewrite_dependencies_dependency_id"; then
                    rewrite_dependencies_removed=true
                    continue
                fi
                ;;
        esac

        printf '%s\n' "$rewrite_dependencies_reference" >> "$rewrite_dependencies_kept"
    done < "$rewrite_dependencies_deps"

    [ "$rewrite_dependencies_removed" = true ] || return 0

    rewrite_dependencies_value=$(dependency_list "$rewrite_dependencies_kept")
    printf '%s\n%s\n' "$rewrite_dependencies_path" "$rewrite_dependencies_value" >> "$updates_file"
}

collect_dependency_updates() {
    while IFS= read -r collect_updates_path || [ -n "$collect_updates_path" ]; do
        [ -n "$collect_updates_path" ] || continue
        line_exists "$removed_file" "$collect_updates_path" && continue

        rewrite_dependencies "$collect_updates_path"
    done < "$open_tickets_file"
}

rewrite_ticket_dependencies() {
    rewrite_ticket_path=$1
    rewrite_ticket_dependencies=$2
    rewrite_ticket_file=$project_dir/$rewrite_ticket_path
    rewrite_ticket_tmp=$rewrite_ticket_file.tmp.$$

    if ! awk \
        -v dependencies="$rewrite_ticket_dependencies" '
            NR == 1 && $0 == "---" {
                in_frontmatter = 1
                print
                next
            }
            NR == 1 { exit 1 }
            in_frontmatter && $0 == "---" {
                in_frontmatter = 0
                found_end = 1
                print
                next
            }
            in_frontmatter && index($0, "dependencies:") == 1 {
                found_dependencies = 1
                if (dependencies) {
                    print "dependencies: " dependencies
                } else {
                    print "dependencies:"
                }
                next
            }
            { print }
            END {
                if (!found_end || !found_dependencies) {
                    exit 1
                }
            }
        ' "$rewrite_ticket_file" > "$rewrite_ticket_tmp"
    then
        rm -f "$rewrite_ticket_tmp"
        fatal "ticket dependencies field is not writable: $rewrite_ticket_path"
    fi

    if ! mv "$rewrite_ticket_tmp" "$rewrite_ticket_file"; then
        rm -f "$rewrite_ticket_tmp"
        fatal "failed to update ticket file: $rewrite_ticket_path"
    fi
}

confirm_prune() {
    echo "The following tickets would only be removed because --prune was used:" >&2

    while IFS= read -r confirm_prune_path || [ -n "$confirm_prune_path" ]; do
        [ -n "$confirm_prune_path" ] || continue
        echo "  $confirm_prune_path" >&2
    done < "$prune_only_file"

    printf 'Remove these tickets? [y/N] ' >&2
    confirm_prune_answer=
    if IFS= read -r confirm_prune_answer; then
        :
    fi

    case "$confirm_prune_answer" in
        y|Y|yes|YES|Yes)
            return 0
            ;;
        *)
            fatal "clean aborted"
            ;;
    esac
}

print_plan() {
    while IFS= read -r print_plan_path && IFS= read -r print_plan_dependencies; do
        [ -n "$print_plan_path" ] || continue
        printf 'update %s\n' "$print_plan_path"
    done < "$updates_file"

    while IFS= read -r print_plan_path || [ -n "$print_plan_path" ]; do
        [ -n "$print_plan_path" ] || continue
        printf 'remove %s\n' "$print_plan_path"
    done < "$removed_file"
}

apply_plan() {
    while IFS= read -r apply_plan_path && IFS= read -r apply_plan_dependencies; do
        [ -n "$apply_plan_path" ] || continue

        rewrite_ticket_dependencies "$apply_plan_path" "$apply_plan_dependencies"
        printf 'update %s\n' "$apply_plan_path"
    done < "$updates_file"

    while IFS= read -r apply_plan_path || [ -n "$apply_plan_path" ]; do
        [ -n "$apply_plan_path" ] || continue

        apply_plan_file=$project_dir/$apply_plan_path
        rm -f "$apply_plan_file" || fatal "failed to remove ticket: $apply_plan_path"
        printf 'remove %s\n' "$apply_plan_path"
    done < "$removed_file"
}

require_coderail_directory

active_tickets_file=$tmp_dir/active-tickets
open_tickets_file=$tmp_dir/open-tickets
closed_tickets_file=$tmp_dir/closed-tickets
normal_removed_file=$tmp_dir/normal-removed
normal_removed_ids_file=$tmp_dir/normal-removed-ids
removed_file=$tmp_dir/removed
removed_dependency_ids_file=$tmp_dir/removed-dependency-ids
pruned_open_file=$tmp_dir/pruned-open
prune_only_file=$tmp_dir/prune-only
updates_file=$tmp_dir/updates
resolve_error_file=$tmp_dir/resolve-error

: > "$normal_removed_file"
: > "$normal_removed_ids_file"
: > "$removed_file"
: > "$removed_dependency_ids_file"
: > "$pruned_open_file"
: > "$prune_only_file"
: > "$updates_file"
: > "$resolve_error_file"

collect_state_tickets active "$active_tickets_file"
collect_state_tickets open "$open_tickets_file"
collect_state_tickets closed "$closed_tickets_file"

if [ -s "$active_tickets_file" ]; then
    active_ticket_path=$(sed -n '1p' "$active_tickets_file")
    fatal "active tickets must be closed or deactivated before cleaning: $active_ticket_path"
fi

collect_normal_removed_tickets

if [ "$prune" = true ]; then
    cat "$closed_tickets_file" > "$removed_file"
    collect_pruned_open_tickets
    cat "$pruned_open_file" >> "$removed_file"
    collect_ticket_ids "$closed_tickets_file" "$removed_dependency_ids_file"
else
    cat "$normal_removed_file" > "$removed_file"
    cat "$normal_removed_ids_file" > "$removed_dependency_ids_file"
fi

collect_prune_only_tickets
collect_dependency_updates

if [ "$dry_run" = true ]; then
    print_plan
    exit 0
fi

if [ "$prune" = true ] && [ "$yes" = false ] && [ -s "$prune_only_file" ]; then
    confirm_prune
fi

apply_plan
