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

    tree_scan=$(_scan_tree)
    if [ -z "$tree_scan" ]; then
        output "No ideas found"
        exit "$SUCCESS_EXIT_CODE"
    fi

    if [ "$output_json" = true ]; then
        result="{$NL$TAB\"ideas\": ["
    else
        result="Idea map tree:"
    fi

    while IFS= read -r line; do
        result="$result$NL$line"
    done <<EOF
$tree_scan
EOF

    if [ "$output_json" = true ]; then
        result="$result$NL$TAB]$NL}"
    fi

    output "$result"
}