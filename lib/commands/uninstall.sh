#!/usr/bin/env sh

usage()
{
    available_harnesses=$(connector_load_available | awk '
        NF {
            harness = $0
            sub(/^.*\//, "", harness)
            if (count++) printf " | "
            printf "%s", harness
        }
    ')

    cat <<EOF
Usage:
  cr uninstall [options] [<harness> ...]

  Uninstall instruction set for the specified harnesses, or coderail itself

Options:
  -h, --help            Show this help message and exit
  -f, --force           Force uninstallation, removing user edited files,
                        prompts for confirmation
  -y, --yes             Automatically confirm the prompt
      --self            Uninstall coderail itself, cannot be combined with
                        harness

Arguments:
  <harness>             One or more harnesses to uninstall instruction sets for,
                        currently supported harnesses are:
                        $available_harnesses
EOF
}

execute_command()
{
    uninstall_force=0
    uninstall_yes=0
    uninstall_names=
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
                uninstall_force=1
                ;;
            -y|--yes)
                uninstall_yes=1
                ;;
            --self)
                log_error "--self is reserved for Coderail program removal"
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
            *)
                uninstall_names="$uninstall_names $1"
                ;;
        esac
        shift
    done
    while [ "$#" -gt 0 ]; do
        uninstall_names="$uninstall_names $1"
        shift
    done
    uninstall_names="${uninstall_names#"${uninstall_names%%[![:space:]]*}"}"

    [ -n "$uninstall_names" ] || {
        log_error "At least one harness is required"
        usage >&2
        exit "$_CR_USAGE_EXIT_CODE"
    }

    # read install manifest, determine which files can be removed safely
    # prompt for confirmation if forced but not auto-confirmed
    # remove files
}
