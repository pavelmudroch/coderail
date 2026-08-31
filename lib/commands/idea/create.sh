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
                exit "$SUCCESS_EXIT_CODE"
                ;;
            --help=*)
                log_error "--help does not take an argument"
                usage >&2
                exit "$USAGE_EXIT_CODE"
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
        exit "$USAGE_EXIT_CODE"
    fi

    idea_title="$1"
    if parent_idea="$( _normalize_idea_path "$parent_idea" )"; then
        :
    else
        log_error "Invalid parent idea path: $parent_idea"
        exit "$USAGE_EXIT_CODE"
    fi

    idea_path="$(slugify "$idea_title")"
    if [ -n "$parent_idea" ]; then
        parent_status="$(_get_idea_status "$parent_idea")"
        if [ $? -ne 0 ]; then
            log_error "Failed to get status of parent idea: $parent_status"
            exit "$ERROR_EXIT_CODE"
        fi

        if [ "$parent_status" != "$IDEA_STATUS_SPLIT" ]; then
            log_error "Parent idea must be in 'split' status to create a child idea"
            exit "$ERROR_EXIT_CODE"
        fi

        idea_path="$parent_idea/$idea_path"
    fi

    idea_file=$(_get_idea_file "$idea_path")
    if [ -f "$idea_file" ]; then
        log_error "Idea already exists at path: $idea_file"
        exit "$ERROR_EXIT_CODE"
    fi

    idea_file_content="---\ntitle: \"$idea_title\"\nstatus: \"$IDEA_STATUS_FORGING\"\n---"
    if message=$(fs_safely_init_file "$idea_file" "$idea_file_content"); then
        :
    else
        log_error "Failed to create idea: $message"
        exit "$ERROR_EXIT_CODE"
    fi

    output "$idea_file"
}