#!/usr/bin/env sh

IDEA_STATUS_READY="ready"
IDEA_STATUS_FORGING="forging"
IDEA_STATUS_SPLIT="split"

PLANS_DIR=".coderail/plans"

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
  split                Split an idea into multiple child ideas
  ready                Mark an idea as ready
  reforge              Reforge an idea which has been previously marked as ready
EOF
}

execute_command()
{
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
            map|create|split|ready|reforge)
                command="$1"
                shift
                break
                ;;
            *)
                log_error "Unknown argument: $1"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
        esac
        shift
    done

    script="$_CR_INSTALL_DIR/lib/commands/idea/$command.sh"
    (
        . "$script"
        execute_command "$@"
    )
}

_normalize_idea_path()
{
    normalized_path="$1"
    normalized_path="${normalized_path#$PLANS_DIR/}"
    normalized_path="${normalized_path%/IDEA.md}"
    normalized_path=$(path_normalize_relative "$normalized_path")
    echo "$normalized_path"
}

_ensure_plans_dir()
{
    if ! fs_make_dir "$PLANS_DIR"; then
        log_error "Failed to create \"$PLANS_DIR\" directory"
        return 1
    fi
}

_read_idea_file()
{
    normalized_path="$1"
    idea_file="$PLANS_DIR/$normalized_path/IDEA.md"

    if [ ! -f "$idea_file" ]; then
        echo "File \"$idea_file\" does not exist"
        return 1
    fi

    if ! idea_content=$(cat "$idea_file"); then
        echo "$idea_file"
        return 1
    fi

    if ! message="$(md_is_frontmatter_valid "$idea_content")"; then
        echo "Invalid frontmatter: \"$message\""
        return 1
    fi

    echo "$idea_content"
}


_scan_tree()
{
    log_verbose "Scanning idea tree..."

    [ -d "$PLANS_DIR" ] || return 0

    find "$PLANS_DIR" -type d ! -path "$PLANS_DIR" | LC_ALL=C sort
}

_validate_idea_path()
{
    idea_path="$(_normalize_idea_path "$1")"
    idea_dir="$PLANS_DIR/$idea_path"
    accumulate_errors=${2:-false}
    if [ "$accumulate_errors" != true ] && [ "$accumulate_errors" != false ]; then
        accumulate_errors=false
    fi

    if [ ! -d "$idea_dir" ]; then
        echo "Not a directory"
        return 1
    fi

    if [ ! -f "$idea_dir/IDEA.md" ]; then
        echo "Missing IDEA.md file"
        return 1
    fi

    if [ ! -r "$idea_dir/IDEA.md" ]; then
        echo "IDEA.md file is not readable"
        return 1
    fi

    idea_content=$(cat "$idea_dir/IDEA.md" 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo "Failed to read IDEA.md file"
        return 1
    fi

    if front_matter=$(yaml_get_front_matter "$idea_content"); then
        :
    else
        echo "Failed to parse front matter: $front_matter"
        return 1
    fi

    status=$(yaml_get_front_matter_key "$front_matter" "status")
    if [ -z "$status" ]; then
        echo "Missing status in front matter"
        [ "$accumulate_errors" = true ] || return 1
    fi

    title=$(yaml_get_front_matter_key "$front_matter" "title")
    if [ -z "$title" ]; then
        echo "Missing title in front matter"
        [ "$accumulate_errors" = true ] || return 1
    fi

    child_idea_count=$(find "$idea_dir" -type d ! -path "$idea_dir" -prune -print | awk 'END { print NR }')
    if [ "$status" == "$IDEA_STATUS_SPLIT" ] && [ "$child_idea_count" -lt 2 ]; then
        echo "Split idea must have at least two child ideas"
        return 1
    fi

    if [ "$status" != "$IDEA_STATUS_SPLIT" ] && [ "$child_idea_count" -ne 0 ]; then
        echo "Non-split idea should not have child ideas"
        return 1
    fi

    if [ "$status" != "$IDEA_STATUS_READY" ] && [ -f "$idea_dir/SPEC.md" ]; then
        echo "SPEC.md file should not exist when idea is not ready"
        return 3
    fi
}

_parse_idea_path()
{
    idea_path="$(_normalize_idea_path "$1")"
    file="$(_get_idea_file "$idea_path")"
    if front_matter="$(yaml_get_front_matter "$(cat "$file")")"; then
        :
    fi
    status=$(yaml_get_front_matter_key "$front_matter" "status")
    title=$(yaml_get_front_matter_key "$front_matter" "title")
    parent="${idea_path%/*}"
    if [ "$parent" = "$idea_path" ]; then
        parent=""
    fi
}