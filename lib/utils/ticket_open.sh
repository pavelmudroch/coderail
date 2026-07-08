#!/usr/bin/env sh

_ticket_open_trim() {
    printf '%s\n' "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

_ticket_open_line_exists() {
    _ticket_open_line_exists_file=$1
    _ticket_open_line_exists_value=$2

    [ -f "$_ticket_open_line_exists_file" ] || return 1

    while IFS= read -r _ticket_open_line_exists_line ||
        [ -n "$_ticket_open_line_exists_line" ]; do
        [ "$_ticket_open_line_exists_line" = "$_ticket_open_line_exists_value" ] && return 0
    done < "$_ticket_open_line_exists_file"

    return 1
}

_ticket_open_append_unique_line() {
    _ticket_open_append_unique_file=$1
    _ticket_open_append_unique_value=$2

    _ticket_open_line_exists "$_ticket_open_append_unique_file" "$_ticket_open_append_unique_value" ||
        printf '%s\n' "$_ticket_open_append_unique_value" >> "$_ticket_open_append_unique_file"
}

_ticket_open_dependency_list() {
    _ticket_open_dependency_list_file=$1

    awk '
        NF {
            if (value) {
                value = value ", " $0
            } else {
                value = $0
            }
        }
        END { print value }
    ' "$_ticket_open_dependency_list_file"
}

_ticket_open_ticket_dependencies() {
    _ticket_open_ticket_dependencies_file=$1
    _ticket_open_ticket_dependencies_value=$(
        _ticket_frontmatter_value "$_ticket_open_ticket_dependencies_file" dependencies
    ) || return 1

    printf '%s\n' "$_ticket_open_ticket_dependencies_value" | tr ',' '\n' |
        while IFS= read -r _ticket_open_ticket_dependencies_item ||
            [ -n "$_ticket_open_ticket_dependencies_item" ]; do
            _ticket_open_ticket_dependencies_item=$(
                _ticket_open_trim "$_ticket_open_ticket_dependencies_item"
            )
            [ -n "$_ticket_open_ticket_dependencies_item" ] || continue
            printf '%s\n' "$_ticket_open_ticket_dependencies_item"
        done
}

_ticket_open_rewrite_dependencies() {
    _ticket_open_rewrite_file=$1
    _ticket_open_rewrite_dependencies=$2
    _ticket_open_rewrite_tmp=$_ticket_open_rewrite_file.tmp.$$

    if ! awk \
        -v dependencies="$_ticket_open_rewrite_dependencies" '
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
        ' "$_ticket_open_rewrite_file" > "$_ticket_open_rewrite_tmp"
    then
        rm -f "$_ticket_open_rewrite_tmp"
        _ticket_error "ticket dependencies field is not writable: $_ticket_open_rewrite_file"
        return 1
    fi

    if ! mv "$_ticket_open_rewrite_tmp" "$_ticket_open_rewrite_file"; then
        rm -f "$_ticket_open_rewrite_tmp"
        _ticket_error "failed to update ticket file: $_ticket_open_rewrite_file"
        return 1
    fi
}

ticket_open_with_dependencies() {
    [ "$#" -eq 3 ] || _ticket_error "ticket_open_with_dependencies expects 3 arguments" || return 1

    _ticket_open_project=$1
    _ticket_open_file=$2
    _ticket_open_depends_on=$3
    _ticket_open_id=$(ticket_id_from_name "$_ticket_open_file") || return 1
    _ticket_open_target_dir=$_ticket_open_project/.coderail/tickets/open
    _ticket_open_target_rel=.coderail/tickets/open/$(basename "$_ticket_open_file")
    _ticket_open_target=$_ticket_open_project/$_ticket_open_target_rel

    mkdir -p "$_ticket_open_target_dir" ||
        _ticket_error "failed to create ticket state directory: $_ticket_open_target_dir" ||
        return 1

    [ ! -e "$_ticket_open_target" ] ||
        _ticket_error "target ticket already exists: $_ticket_open_target_rel" ||
        return 1

    _ticket_open_temp_dir="${TMPDIR:-/tmp}"
    _ticket_open_temp_dir=${_ticket_open_temp_dir%/}
    _ticket_open_tmp_dir=$(mktemp -d "$_ticket_open_temp_dir/coderail-ticket-open.XXXXXX") ||
        return 1
    _ticket_open_dependencies_file=$_ticket_open_tmp_dir/dependencies
    _ticket_open_depends_on_file=$_ticket_open_tmp_dir/depends-on

    : > "$_ticket_open_dependencies_file"

    if ! _ticket_open_ticket_dependencies "$_ticket_open_file" > "$_ticket_open_tmp_dir/existing"; then
        rm -rf "$_ticket_open_tmp_dir"
        return 1
    fi

    while IFS= read -r _ticket_open_dependency_id ||
        [ -n "$_ticket_open_dependency_id" ]; do
        [ -n "$_ticket_open_dependency_id" ] || continue

        if [ "$_ticket_open_dependency_id" = "$_ticket_open_id" ]; then
            rm -rf "$_ticket_open_tmp_dir"
            _ticket_error "ticket cannot depend on itself: $_ticket_open_id"
            return 1
        fi

        _ticket_open_append_unique_line "$_ticket_open_dependencies_file" "$_ticket_open_dependency_id"
    done < "$_ticket_open_tmp_dir/existing"

    if [ -n "$_ticket_open_depends_on" ]; then
        printf '%s\n' "$_ticket_open_depends_on" > "$_ticket_open_depends_on_file"

        while IFS= read -r _ticket_open_dependency_reference ||
            [ -n "$_ticket_open_dependency_reference" ]; do
            [ -n "$_ticket_open_dependency_reference" ] || continue

            _ticket_open_dependency_path=$(
                ticket_resolve_reference "$_ticket_open_project" "$_ticket_open_dependency_reference"
            ) || {
                rm -rf "$_ticket_open_tmp_dir"
                return 1
            }
            _ticket_open_dependency_id=$(
                ticket_id_from_name "$_ticket_open_dependency_path"
            ) || {
                rm -rf "$_ticket_open_tmp_dir"
                return 1
            }

            if [ "$_ticket_open_dependency_id" = "$_ticket_open_id" ]; then
                rm -rf "$_ticket_open_tmp_dir"
                _ticket_error "ticket cannot depend on itself: $_ticket_open_id"
                return 1
            fi

            _ticket_open_append_unique_line "$_ticket_open_dependencies_file" "$_ticket_open_dependency_id"
        done < "$_ticket_open_depends_on_file"
    fi

    _ticket_open_dependencies=$(_ticket_open_dependency_list "$_ticket_open_dependencies_file") || {
        rm -rf "$_ticket_open_tmp_dir"
        return 1
    }

    if ! _ticket_open_rewrite_dependencies "$_ticket_open_file" "$_ticket_open_dependencies"; then
        rm -rf "$_ticket_open_tmp_dir"
        return 1
    fi

    _ticket_open_path=$(ticket_move_to_state "$_ticket_open_project" "$_ticket_open_file" open) || {
        rm -rf "$_ticket_open_tmp_dir"
        return 1
    }

    if ! ticket_validate_file "$_ticket_open_project" "$_ticket_open_project/$_ticket_open_path"; then
        rm -rf "$_ticket_open_tmp_dir"
        return 1
    fi

    rm -rf "$_ticket_open_tmp_dir"
    printf '%s\n' "$_ticket_open_path"
}
