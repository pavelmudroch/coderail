#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr idea validate [options]  [<idea_path> ...]

  Validate an idea(s) for completeness and consistency. If no idea path is
  provided, all ideas will be validated. If one or more idea paths are
  specified, only those ideas will be validated.

Options:
  -h, --help           Show this help message and exit

Arguments:
  <idea_path>          Optional idea path to validate
EOF
}

execute_command()
{
    idea_paths=""
    while [ $# -gt 0 ]; do
        case "$1" in
            -h|--help)
                usage
                exit "$SUCCESS_EXIT_CODE"
                ;;
            *)
                if [ -z "$idea_paths" ]; then
                    idea_paths="$1"
                else
                    idea_paths="$idea_paths$NL$1"
                fi
                ;;
        esac
        shift
    done

    if [ -z "$idea_paths" ]; then
        idea_paths="$(_scan_tree)"
    fi

    all_ideas_valid=true
    while IFS= read -r path; do
        log_verbose "Checking idea at $path"

        if errors="$(_validate_idea_path "$path" true)"; then
            continue
        fi

        all_ideas_valid=false
        output "Invalid idea at $path"
        output "$errors"
    done <<EOF
$idea_paths
EOF
    if [ "$all_ideas_valid" = true ]; then
        output "All checked ideas are valid"
        exit "$SUCCESS_EXIT_CODE"
    else
        exit "$ERROR_EXIT_CODE"
    fi
}