#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr idea reforge [options] <idea_path>

  Reforge an idea which has been previously marked as ready.

Options:
  -h, --help           Show this help message and exit

Arguments:
  <idea_path>          Path of the idea to reforge
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
        log_error "Exactly one idea path must be provided"
        usage >&2
        exit "$_CR_USAGE_EXIT_CODE"
    fi

    idea_path="$1"
    if ! idea_path="$(_normalize_idea_path "$idea_path")"; then
        log_error "Invalid idea path: \"$idea_path\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if ! idea_content="$(_read_idea_file "$idea_path")"; then
        log_error "Failed to read idea file: $idea_content"
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    status="$(printf '%s' "$idea_content" | md_frontmatter_get "status")"
    if [ "$status" != "$IDEA_STATUS_READY" ]; then
        log_error "Only ready ideas can be reforged: Status \"$status\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    idea_file="$PLANS_DIR/$idea_path/IDEA.md"
    if ! printf '%s' "$idea_content" \
        | md_frontmatter_set "status" "$IDEA_STATUS_FORGING" \
        | fs_write "$idea_file"
    then
        log_error "Failed to update idea file: \"$idea_file\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    output "\"$idea_file\" forging"
}