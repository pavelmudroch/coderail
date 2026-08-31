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
                exit "$SUCCESS_EXIT_CODE"
                ;;
            --help=*)
                log_error "--help does not take an argument"
                usage >&2
                exit "$USAGE_EXIT_CODE"
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
                        child_titles="$child_titles$NL$1"
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
                child_titles="$child_titles$NL$1"
            fi
        fi
        arg_pos=$((arg_pos + 1))
        shift
    done

    if [ -z "$idea_path" ]; then
        log_error "Idea path is required"
        usage >&2
        exit "$USAGE_EXIT_CODE"
    fi

    if [ -z "$child_titles" ] || [ "$(echo "$child_titles" | wc -l)" -lt 2 ]; then
        log_error "At least two child titles are required"
        usage >&2
        exit "$USAGE_EXIT_CODE"
    fi

    output "Idea path: $idea_path"
    output "Child titles:"
    output "$child_titles"
}