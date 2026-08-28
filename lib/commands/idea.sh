#!/usr/bin/env sh

IDEA_STATUS_READY="ready"
IDEA_STATUS_FORGING="forging"
IDEA_STATUS_SPLIT="split"

usage() {
    cat <<'EOF'
Usage:
  cr idea [options] <command>

  Manage ideas.

Options:
  -h, --help           Show this help message and exit

Commands:
  map                  Generate map of ideas and their relationships
  create               Create a new idea
  validate             Validate an idea(s) for completeness and consistency
EOF
}

execute_command()
{
    while [ $# -gt 0 ]; do
        case "$1" in
            -h|--help)
                usage
                exit "$SUCCESS_EXIT_CODE"
                ;;
            map|create|validate)
                command="$1"
                shift
                break
                ;;
            *)
                log_error "Unknown argument: $1"
                usage >&2
                exit "$USAGE_EXIT_CODE"
                ;;
        esac
        shift
    done

    script="$ROOT_DIR/lib/commands/idea/$command.sh"
    (
        . "$script"
        execute_command "$@"
    )
}

_get_idea_file()
{
    idea_file=".coderail/plans/$1/IDEA.md"
    echo "$idea_file"
}

_get_idea_status()
{
    idea_file="$(_get_idea_file "$1")"
    if [ ! -f "$idea_file" ]; then
        echo "Idea file not found"
        return 1
    fi

    if content=$(cat "$idea_file" 2>/dev/null); then
        :
    else
        echo "Failed to read idea file"
        return 1
    fi

    front_matter=$(yaml_get_front_matter "$content")
    if [ $? -ne 0 ]; then
        echo "Failed to parse front matter: $front_matter"
        return 1
    fi

    status=$(yaml_get_front_matter_key "$front_matter" "status")
    if [ $? -ne 0 ]; then
        echo "Failed to get status from front matter: $status"
        return 1
    fi
    echo "$status"
}

_scan_tree()
{
    plans_dir=".coderail/plans"

    [ -d "$plans_dir" ] || return 0

    find "$plans_dir" -type f -name IDEA.md | LC_ALL=C sort | while IFS= read -r idea_file; do
        [ "$idea_file" = "$plans_dir/IDEA.md" ] && continue

        path=${idea_file#"$plans_dir"/}
        path=${path%/IDEA.md}
        parent=${path%/*}
        [ "$parent" = "$path" ] && parent=""

        title=""
        status=""
        if content=$(cat "$idea_file" 2>/dev/null) && \
            front_matter=$(yaml_get_front_matter "$content" 2>/dev/null); then
            title=$(yaml_get_front_matter_key "$front_matter" "title")
            status=$(yaml_get_front_matter_key "$front_matter" "status")
        fi

        printf '%s\t%s\t%s\t%s\t%s\n' \
            "$path" "$idea_file" "$title" "$status" "$parent"
    done
}
