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

    _safely_init_dir ""
    _safely_init_dir "plans/"
    _safely_init_file "coderail.conf" _generate_config_content
    _safely_init_file "test_map" _generate_test_map_content

    spinner_close
    output "Coderail initialized in the current directory."
}

_safely_init_dir()
{
    dirname="$1"

    if [ -d ".coderail/$dirname" ]; then
        log_verbose "The .coderail/$dirname directory already exists."
    else
        if error=$(mkdir -p ".coderail/$dirname" 2>&1); then
            log_verbose "Created .coderail/$dirname directory."
        else
            spinner_close
            log_error "Failed to create .coderail/$dirname directory.\n> $error"
            exit "$ERROR_EXIT_CODE"
        fi
    fi
}

_safely_init_file()
{
    filename="$1"
    content_generator="$2"

    if [ -e ".coderail/$filename" ]; then
        log_verbose "The .coderail/$filename file already exists."
    else
        tmp="$tmp_dir/$filename"
        if error=$(
            $content_generator > "$tmp" 2>&1 && \
            mv "$tmp" ".coderail/$filename" 2>&1
        ); then
            log_verbose "Created .coderail/$filename file."
        else
            spinner_close
            log_error "Failed to create .coderail/$filename file.\n> $error"
            exit "$ERROR_EXIT_CODE"
        fi
    fi
}

_generate_config_content()
{
    printf "# This is CodeRail configuration file\n# Lines starting with '#' are comments\n"
}

_generate_test_map_content()
{
    printf "# This is CodeRail test map file\n# Lines starting with '#' are comments\n"
}