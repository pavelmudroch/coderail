#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr init [options]

  Initialize current directory for CodeRail.

Options:
  -h, --help           Show this help message and exit
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
            --help=*)
                log_error "--help does not take an argument"
                usage >&2
                exit "$USAGE_EXIT_CODE"
                ;;
            *)
                log_error "Unknown option: $1"
                usage >&2
                exit "$USAGE_EXIT_CODE"
                ;;
        esac
    done

    spinner "Initializing coderail"

    if ! fs_safely_init_dir "$CR_DIR_NAME"; then
        spinner_close
        exit "$ERROR_EXIT_CODE"
    fi

    if ! fs_safely_init_dir "$CR_DIR_NAME/plans/"; then
        spinner_close
        exit "$ERROR_EXIT_CODE"
    fi

    if ! fs_safely_init_file "$CR_DIR_NAME/coderail.conf" "$(_generate_config_content)"; then
        spinner_close
        exit "$ERROR_EXIT_CODE"
    fi

    if ! fs_safely_init_file "$CR_DIR_NAME/test_map" "$(_generate_test_map_content)"; then
        spinner_close
        exit "$ERROR_EXIT_CODE"
    fi

    spinner_close
    output "Coderail initialized in the current directory."
}

_generate_config_content()
{
    printf "# This is CodeRail configuration file\n# Lines starting with '#' are comments\n"
}

_generate_test_map_content()
{
    printf "# This is CodeRail test map file\n# Lines starting with '#' are comments\n"
}