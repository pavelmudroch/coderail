#!/usr/bin/env sh

usage()
{
    cat <<'EOF'
Usage:
  cr install [options] [<harness> ...]

  Install instruction set for the specified harnesses

Options:
  -h, --help            Show this help message and exit
  -f, --force           Force installation, overwriting user edited files,
                        prompts for confirmation
  -y, --yes             Automatically confirm the prompt

Arguments:
  <harness>             One or more harnesses to install instruction sets for,
                        currently supported harnesses are:
                        codex | claude | copilot | gemini
EOF
}

execute_command()
{
    install_force=0
    install_yes=0
    install_names=
    while [ "$#" -gt 0 ]; do
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
            -f|--force)
                install_force=1
                ;;
            -y|--yes)
                install_yes=1
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
            *)
                install_names="$install_names $1"
                ;;
        esac
        shift
    done
    while [ "$#" -gt 0 ]; do
        install_names="$install_names $1"
        shift
    done
    install_names="${install_names#"${install_names%%[![:space:]]*}"}"

    [ -n "$install_names" ] || {
        log_error "At least one harness is required"
        usage >&2
        exit "$_CR_USAGE_EXIT_CODE"
    }

    # for each harness create temp dir, populate with rendered files
    # check confilicts
    # install files from temp dir
}
