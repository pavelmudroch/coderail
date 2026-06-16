#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

usage() {
    cat <<'EOF'
Usage:
  cr upgrade [options]

  Upgrade this cli tool to a different version

Options:
  -h, --help            Show this help message and exit
  --version=<version>, --version <version>
                        Specify the version to upgrade to (e.g., "1.2.3")
  --dev                 Upgrade to the latest development version
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 1
}

set_single_option() {
    [ "$option_set" = false ] || error "only one option can be specified"
    option_set=true
}

set_version() {
    [ -n "$1" ] || error "--version requires a value"

    version=$1
}

option_set=false
version=
dev_mode=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        --help)
            set_single_option
            shift
            [ "$#" -eq 0 ] || error "only one option can be specified"
            usage
            exit 0
            ;;
        --help=*)
            error "--help does not accept a value"
            ;;
        --version=*)
            set_single_option
            set_version "${1#--version=}"
            shift
            ;;
        --version)
            set_single_option
            shift
            [ "$#" -gt 0 ] || error "--version requires a value"
            case "$1" in
                --*) error "--version requires a value" ;;
            esac
            set_version "$1"
            shift
            ;;
        --dev)
            set_single_option
            dev_mode=true
            shift
            ;;
        --dev=*)
            error "--dev does not accept a value"
            ;;
        --*)
            error "unknown option: $1"
            ;;
        *)
            error "unexpected argument: $1"
            ;;
    esac
done

:
