#!/usr/bin/env sh

set -eu

usage() {
    cat <<'EOF'
Usage:
  cr upgrade [options]

  Upgrade this cli tool to latest or specified version.

Options:
  -h, --help            Show this help message and exit
  --version <version>
                        Upgrade to a specific version, default is latest
  --canary              Upgrade to the latest build from main branch
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

upgrade_version=latest
upgrade_version_set=false
upgrade_canary=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --version=*)
            [ "$upgrade_version_set" = false ] || error "--version provided multiple times"
            [ "$upgrade_canary" = false ] || error "--version cannot be used with --canary"
            upgrade_version=${1#--version=}
            [ -n "$upgrade_version" ] || error "--version requires a non-empty value"
            upgrade_version_set=true
            shift
            ;;
        --version)
            [ "$upgrade_version_set" = false ] || error "--version provided multiple times"
            [ "$upgrade_canary" = false ] || error "--version cannot be used with --canary"
            shift
            [ "$#" -gt 0 ] || error "--version requires a value"
            [ -n "$1" ] || error "--version requires a non-empty value"
            upgrade_version=$1
            upgrade_version_set=true
            shift
            ;;
        --canary)
            [ "$upgrade_canary" = false ] || error "--canary provided multiple times"
            [ "$upgrade_version_set" = false ] || error "--canary cannot be used with --version"
            upgrade_canary=true
            shift
            ;;
        --)
            shift
            break
            ;;
        --*)
            error "unknown option: $1"
            ;;
        -*)
            error "unknown option: $1"
            ;;
        *)
            break
            ;;
    esac
done

[ "$#" -eq 0 ] || error "unexpected argument: $1"
