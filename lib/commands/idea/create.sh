#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr idea create [options] <idea-title>

  Create a new empty idea file with specified title and optional parent idea.

Options:
  -h, --help           Show this help message and exit
  -p, --parent <parent-idea-path>
                       The path to the parent idea

Arguments:
  <idea-title>         The title of the idea to create
EOF
}

execute_command()
{
    parent_idea=""
    idea_title=""

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
            -p|--parent)
                shift
                parent_idea="$1"
                ;;
            --parent=*)
                parent_idea="${1#*=}"
                ;;
            --)
                break
                shift
                ;;
            *)
                break
                ;;
        esac
        shift
    done

    if [ $# -ne 1 ]; then
        log_error "Exactly one idea title must be provided"
        usage >&2
        exit "$_CR_USAGE_EXIT_CODE"
    fi

    if ! parent_idea="$(_normalize_idea_path "$parent_idea")"; then
        log_error "Invalid parent idea path: \"$parent_idea\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if [ -n "$parent_idea" ]; then
        parent_idea_file=$(_get_idea_file "$parent_idea")
        if [ ! -f "$parent_idea_file" ]; then
            log_error "Parent idea does not exist: \"$parent_idea\""
            exit "$_CR_ERROR_EXIT_CODE"
        fi

        if ! parent_idea_content="$(cat "$parent_idea_file")"; then
            log_error "Failed to read parent idea file: $parent_idea_file"
            exit "$_CR_ERROR_EXIT_CODE"
        fi

        if ! message="$(printf '%s' "$parent_idea_content" | md_is_frontmatter_valid)"; then
            log_error "Parent idea file has invalid frontmatter: $parent_idea_file"
            exit "$_CR_ERROR_EXIT_CODE"
        fi

        status="$(printf '%s' "$parent_idea_content" | md_frontmatter_get "status")"
        if [ "$status" != "$IDEA_STATUS_SPLIT" ]; then
            log_error "Parent idea must be in 'split' status to create a child idea"
            exit "$_CR_ERROR_EXIT_CODE"
        fi
    fi

    idea_title="$1"
    idea_path="$(slugify "$idea_title")"
    idea_file=$(_get_idea_file "$idea_path")
    if [ -f "$idea_file" ]; then
        log_error "Idea already exists at path: $idea_file"
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! md_frontmatter_empty \
        | md_frontmatter_set "title" "$idea_title" \
        | md_frontmatter_set "status" "$IDEA_STATUS_FORGING" \
        | fs_write "$idea_file"
    then
        log_error "Failed to create idea file: $idea_file"
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    output "$idea_file"
}