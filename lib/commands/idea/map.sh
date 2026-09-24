#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr idea map [options]

  Generate tree-like map of ideas, their relationships and statuses.

Options:
  -h, --help            Show this help message and exit
      --json            Output the idea map in JSON format
EOF
}

execute_command()
{
    output_json=false
    while [ $# -gt 0 ]; do
        case "$1" in
            -h|--help)
                usage
                exit "$_CR_SUCCESS_EXIT_CODE"
                ;;
            --help=*)
                log_error "--help does not take an argument"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
            --json)
                output_json=true
                ;;
            --json=*)
                log_error "--json does not take an argument"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
            -*)
                log_error "Unknown option: $1"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
            *)
                log_error "Unknown argument: $1"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
        esac
        shift
    done

    paths=$(_scan_tree)

    if [ -z "$paths" ]; then
        output "No ideas found"
        exit "$_CR_SUCCESS_EXIT_CODE"
    fi

    result="/"

    if [ "$output_json" = true ]; then
        result="["
    fi

    log_verbose "Building idea map..."
    first=true
    while IFS= read -r path; do
        log_verbose "Checking idea at $path"
        if ! validation_result=$(_validate_idea_path "$path") && [ $? -ne 3 ]; then
            log_error "Invalid idea at $path: $validation_result"
            exit "$_CR_ERROR_EXIT_CODE"
        fi

        _parse_idea_path "$path"
        if [ "$output_json" = true ]; then
            if [ "$first" = true ]; then
                first=false
            else
                result="$result,"
            fi
            formatted_idea="$(_json_formatter "$parsed_path" "$parsed_file" "$parsed_title" "$parsed_status" "$parsed_parent")"
        else
            formatted_idea="$(_plain_text_formatter "$parsed_path" "$parsed_file" "$parsed_title" "$parsed_status" "$parsed_parent")"
        fi
        result="$result$EOL$formatted_idea"
    done <<EOF
$paths
EOF

    if [ "$output_json" = true ]; then
        result="$result$EOL]"
    fi
    output "$result"
}

_json_escape()
{
    printf '%s\n' "$1" | awk '
        BEGIN {
            escapes["\""] = "\\\""
            escapes["\\"] = "\\\\"
            for (i = 1; i < 32; i++) {
                escapes[sprintf("%c", i)] = sprintf("\\u%04x", i)
            }
        }
        {
            if (NR > 1) printf "\\n"
            for (i = 1; i <= length($0); i++) {
                character = substr($0, i, 1)
                printf "%s", character in escapes ? escapes[character] : character
            }
        }
    '
}

_json_formatter()
{
    path=$(_json_escape "$1")
    file=$(_json_escape "$2")
    title=$(_json_escape "$3")
    status=$(_json_escape "$4")
    parent=$(_json_escape "$5")

    printf '  {\n'
    printf '    "path": "%s",\n' "$path"
    printf '    "file": "%s",\n' "$file"
    printf '    "title": "%s",\n' "$title"
    printf '    "status": "%s",\n' "$status"
    if [ -z "$parent" ]; then
        printf '    "parent": null\n'
    else
        printf '    "parent": "%s"\n' "$parent"
    fi
    printf '  }\n'
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

    status_icon="$(_status_icon "$status")"
    printf '%s%s %s %s %s: %s\n' "$tree_prefix" "$branch" "$status_icon" "$(color_yellow "$title")" "$(color_gray "($status)")" "$(color_green "\"$file\"")"
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

_status_icon()
{
    case "$1" in
        ready)
            printf '%s' "$(color_green "✔")"
            ;;
        forging)
            printf '%s' "$(color_red "⛭")"
            ;;
        split)
            printf '%s' "$(color_blue "⌥")"
            ;;
        *)
            printf '%s' "$(color_red "?")"
            ;;
    esac
}
