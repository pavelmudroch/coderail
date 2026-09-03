#!/usr/bin/env sh

usage() {
    cat <<'EOF'
Usage:
  cr init [options] [<template> ...]

  Initialize current directory for CodeRail.

Options:
  -h, --help           Show this help message and exit

Arguments:
  <template>           Optional template(s) to use for initialization. Templates
                       are stored at coderail install location under templates/.
                       Each template defines a set of files and directories to
                       be created during initialization. And optional
                       initialization script to be run during the setup process.
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
                shift
                break
                ;;
            -*)
                log_error "Unknown option: $1"
                usage >&2
                exit "$_CR_USAGE_EXIT_CODE"
                ;;
        esac
    done

    spinner "Initializing coderail"

    templates="$@"
    log_verbose "Creating directory: $_CR_DIR_NAME"
    if ! fs_make_dir "$_CR_DIR_NAME"; then
        spinner_close
        log_error "Failed to create directory: \"$_CR_DIR_NAME\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    log_verbose "Creating directory: $_CR_DIR_NAME/plans"
    if ! fs_make_dir "$_CR_DIR_NAME/plans"; then
        spinner_close
        log_error "Failed to create directory: \"$_CR_DIR_NAME/plans\""
        exit "$_CR_ERROR_EXIT_CODE"
    fi

    if [ -f "$_CR_DIR_NAME/coderail.conf" ]; then
        log_verbose "Configuration file already exists: \"$_CR_DIR_NAME/coderail.conf\""
    else
        log_verbose "Creating default configuration file: \"$_CR_DIR_NAME/coderail.conf\""
        if ! _generate_config_content | fs_write "$_CR_DIR_NAME/coderail.conf"; then
            spinner_close
            log_error "Failed to create default configuration file: \"$_CR_DIR_NAME/coderail.conf\""
            exit "$_CR_ERROR_EXIT_CODE"
        fi
    fi

    if [ -f "$_CR_DIR_NAME/test_map" ]; then
        log_verbose "Test map file already exists: \"$_CR_DIR_NAME/test_map\""
    else
        log_verbose "Creating default test map file: \"$_CR_DIR_NAME/test_map\""
        if ! _generate_test_map_content | fs_write "$_CR_DIR_NAME/test_map"; then
            spinner_close
            log_error "Failed to create default test map file: \"$_CR_DIR_NAME/test_map\""
            exit "$_CR_ERROR_EXIT_CODE"
        fi
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