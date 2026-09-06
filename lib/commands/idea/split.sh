#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr idea split [options] <idea_path> <child_title> <child_title>
                [<child_title> ...]

  Atomically split an idea into multiple child ideas based on the provided child
  titles. An idea status is changed to 'split'. Each child idea is created with
  status 'forging'.

  Important!
  At least two child ideas are required.

Options:
  -h, --help           Show this help message and exit

Arguments:
  <idea_path>          Path of the idea to split
  <child_title>        Title of the child idea to create (specify one or more)
EOF
}

execute_command()
{
    arg_pos=0
    idea_path=""
    first=1
    child_titles=""
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
            --)
                break
                shift
                ;;
            *)
                if [ $arg_pos -eq 0 ]; then
                    idea_path="$1"
                else
                    if [ $first -eq 1 ]; then
                        child_titles="$1"
                        first=0
                    else
                        child_titles="$child_titles$EOL$1"
                    fi
                fi
                arg_pos=$((arg_pos + 1))
                ;;
        esac
        shift
    done

    while [ $# -gt 0 ]; do
        if [ $arg_pos -eq 0 ]; then
            idea_path="$1"
        else
            if [ $first -eq 1 ]; then
                child_titles="$1"
                first=0
            else
                child_titles="$child_titles$EOL$1"
            fi
        fi
        arg_pos=$((arg_pos + 1))
        shift
    done

    if [ -z "$idea_path" ]; then
        log_error "Idea path is required"
        usage >&2
        exit "$_CR_USAGE_EXIT_CODE"
    fi

    if [ -z "$child_titles" ] || [ "$(echo "$child_titles" | wc -l)" -lt 2 ]; then
        log_error "At least two child titles are required"
        usage >&2
        exit "$_CR_USAGE_EXIT_CODE"
    fi

    if ! idea_path="$(_normalize_idea_path "$idea_path")"; then
        log_error "Invalid idea path: \"$idea_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    idea_file="$PLANS_DIR/$idea_path/IDEA.md"
    if ! idea_content="$(_read_idea_file "$idea_path")"; then
        log_error "Failed to read idea file: $idea_content"
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    status="$(printf '%s' "$idea_content" | md_frontmatter_get "status")"
    if [ "$status" != "$IDEA_STATUS_FORGING" ]; then
        log_error "Only forging ideas can be marked as split: Status \"$status\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! temp_dir=$(fs_temp_for_dir "$PLANS_DIR/$idea_path"); then
        log_error "Cannot write to \"$PLANS_DIR/$idea_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! printf '%s' "$idea_content" \
        | md_frontmatter_set "status" "$IDEA_STATUS_SPLIT" \
        > "$temp_dir/IDEA.md"
    then
        log_error "Failed to update idea file: \"$idea_file\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! _create_child_ideas "$child_titles"; then
        log_error "Failed to create child ideas"
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! fs_stage_temp_dir "$temp_dir"; then
        log_error "Failed to update idea at: \"$PLANS_DIR/$idea_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    child_list=""
    while IFS= read -r child_title; do
        child_idea_name=$(slugify "$child_title")
        child_idea_path="$(_normalize_idea_path "$child_idea_name")" || exit 1
        child_idea_file="\"$PLANS_DIR/$idea_path/$child_idea_path/IDEA.md\""
        if [ -z "$child_list" ]; then
            child_list="$child_idea_file"
        else
            child_list="$child_list, $child_idea_file"
        fi
    done <<EOF
$child_titles
EOF

    output "\"$idea_file\" split into $child_list"
}

_create_child_ideas()
{
    child_titles="$1"
    while IFS= read -r child_title; do
        child_idea_name=$(slugify "$child_title")
        child_idea_path="$(_normalize_idea_path "$child_idea_name")" || exit 1
        fs_make_dir "$temp_dir/$child_idea_path" || exit 1
        md_frontmatter_empty \
        | md_frontmatter_set "title" "$child_title" \
        | md_frontmatter_set "status" "$IDEA_STATUS_FORGING" \
        > "$temp_dir/$child_idea_path/IDEA.md" || exit 1
    done <<EOF
$child_titles
EOF
}