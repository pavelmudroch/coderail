#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr idea map [options]

  Generate tree-like map of ideas, their relationships and statuses.

Options:
  -h, --help           Show this help message and exit
      --json           Output the idea map in JSON format
EOF
}

execute_command()
{
    output_json=false
    while [ $# -gt 0 ]; do
        case "$1" in
            -h|--help)
                usage
                exit "$SUCCESS_EXIT_CODE"
                ;;
            --help=*)
                log_error "--help does not take an argument"
                usage >&2
                exit "$USAGE_EXIT_CODE"
                ;;
            --json)
                output_json=true
                ;;
            *)
                log_error "Unknown argument: $1"
                usage >&2
                exit "$USAGE_EXIT_CODE"
                ;;
        esac
        shift
    done

    paths=$(_scan_tree)

    if [ -z "$paths" ]; then
        output "No ideas found"
        exit "$SUCCESS_EXIT_CODE"
    fi

    result="/"

    if [ "$output_json" = true ]; then
        result="["
    fi

    first=true
    while IFS= read -r path; do
        log_verbose "Checking idea at $path"
        if validation_result=$(_validate_idea_path "$path") || [ $? -eq 3 ]; then
            :
        else
            log_error "Invalid idea at $path: $validation_result"
            exit "$ERROR_EXIT_CODE"
        fi
        _parse_idea_path "$path"
        if [ "$output_json" = true ]; then
            if [ "$first" = true ]; then
                first=false
            else
                result="$result,"
            fi
            formatted_idea="$(_json_formatter "$path" "$file" "$title" "$status" "$parent")"
        else
            formatted_idea="$(_plain_text_formatter "$path" "$file" "$title" "$status" "$parent")"
        fi
        result="$result$NL$formatted_idea"
    done <<EOF
$paths
EOF

    if [ "$output_json" = true ]; then
        result="$result$NL]"
    fi
    output "$result"
}

_json_formatter()
{
    path="$1"
    file="$2"
    title="$3"
    status="$4"
    parent="$5"

    echo "  {"
    echo "    \"path\": \"$path\","
    echo "    \"file\": \"$file\","
    echo "    \"title\": \"$title\","
    echo "    \"status\": \"$status\","
    if [ -z "$parent" ]; then
        echo "    \"parent\": null"
    else
        echo "    \"parent\": \"$parent\""
    fi
    echo "  }"
}

_plain_text_formatter()
{
    path="$1"
    file="$2"
    title="$3"
    status="$4"
    remaining_path="$path"
    ancestor_path=""
    tree_prefix=""

    while [ "$remaining_path" != "${remaining_path#*/}" ]; do
        path_segment=${remaining_path%%/*}
        if [ -n "$ancestor_path" ]; then
            ancestor_path="$ancestor_path/$path_segment"
        else
            ancestor_path="$path_segment"
        fi
        _has_later_sibling "$ancestor_path"
        if [ "$has_later_sibling" = true ]; then
            tree_prefix="${tree_prefix}│   "
        else
            tree_prefix="${tree_prefix}    "
        fi
        remaining_path=${remaining_path#*/}
    done

    _has_later_sibling "$path"
    if [ "$has_later_sibling" = true ]; then
        branch="├──"
    else
        branch="└──"
    fi
    printf '%s%s %s %s: %s\n' "$tree_prefix" "$branch" "$(color_yellow "$title")" "$(color_gray "($status)")" "$(color_green "\"$file\"")"
}

_has_later_sibling()
{
    target_path="$1"
    target_parent=${target_path%/*}
    if [ "$target_parent" = "$target_path" ]; then
        target_parent=""
    fi
    has_later_sibling=false
    found_target=false

    while IFS= read -r candidate_directory; do
        candidate_path=${candidate_directory#"$PLANS_DIR"/}
        if [ "$found_target" = true ]; then
            candidate_parent=${candidate_path%/*}
            if [ "$candidate_parent" = "$candidate_path" ]; then
                candidate_parent=""
            fi
            if [ "$candidate_parent" = "$target_parent" ]; then
                has_later_sibling=true
                return
            fi
        elif [ "$candidate_path" = "$target_path" ]; then
            found_target=true
        fi
    done <<EOF
$paths
EOF
}
