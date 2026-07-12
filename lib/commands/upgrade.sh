#!/usr/bin/env sh

set -eu

usage() {
    cat <<'EOF'
Usage:
  cr upgrade [options]

  Upgrade this cli tool. Default upgrade target is latest.

Options:
  -h, --help            Show this help message and exit
  --version X.Y.Z       Upgrade to a release version
  --version vX.Y.Z      Upgrade to a release version
  --canary              Upgrade to the latest build from main branch
                        Mutually exclusive with --version
EOF
}

usage_error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

upgrade_error() {
    echo "error: $*" >&2
    exit 1
}

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../.."
    pwd
)

CODERAIL_ARCHIVE_APPLY_NO_MAIN=1 . "$ROOT_DIR/lib/utils/archive_apply.sh"

upgrade_install_root() {
    if [ "${CODERAIL_BIN_PATH+x}" ]; then
        upgrade_bin_path=$CODERAIL_BIN_PATH
    else
        upgrade_bin_path=$ROOT_DIR/bin/cr
    fi

    [ -n "$upgrade_bin_path" ] ||
        upgrade_error "running bin/cr path is empty"

    upgrade_bin_dir=$(
        CDPATH= cd -- "$(dirname "$upgrade_bin_path")"
        pwd
    ) || upgrade_error "cannot resolve running bin/cr directory"

    [ -f "$upgrade_bin_dir/cr" ] ||
        upgrade_error "running bin/cr was not found: $upgrade_bin_dir/cr"

    CDPATH= cd -- "$upgrade_bin_dir/.." || upgrade_error "cannot resolve install root"
    pwd
}

upgrade_target_ref() {
    upgrade_ref=$(coderail_archive_target_ref "$1" 2>/dev/null) ||
        usage_error "unsupported upgrade target: $1"

    if [ "$upgrade_version_set" = true ] && [ "$upgrade_ref" = main ]; then
        usage_error "unsupported upgrade version: $1"
    fi

    printf '%s\n' "$upgrade_ref"
}

upgrade_version=latest
upgrade_version_set=false
upgrade_canary=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || usage_error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --version=*)
            [ "$upgrade_version_set" = false ] || usage_error "--version provided multiple times"
            [ "$upgrade_canary" = false ] || usage_error "--version cannot be used with --canary"
            upgrade_version=${1#--version=}
            [ -n "$upgrade_version" ] || usage_error "--version requires a non-empty value"
            upgrade_version_set=true
            shift
            ;;
        --version)
            [ "$upgrade_version_set" = false ] || usage_error "--version provided multiple times"
            [ "$upgrade_canary" = false ] || usage_error "--version cannot be used with --canary"
            shift
            [ "$#" -gt 0 ] || usage_error "--version requires a value"
            [ -n "$1" ] || usage_error "--version requires a non-empty value"
            upgrade_version=$1
            upgrade_version_set=true
            shift
            ;;
        --canary)
            [ "$upgrade_canary" = false ] || usage_error "--canary provided multiple times"
            [ "$upgrade_version_set" = false ] || usage_error "--canary cannot be used with --version"
            upgrade_canary=true
            upgrade_version=main
            shift
            ;;
        --)
            shift
            break
            ;;
        --*)
            usage_error "unknown option: $1"
            ;;
        -*)
            usage_error "unknown option: $1"
            ;;
        *)
            break
            ;;
    esac
done

[ "$#" -eq 0 ] || usage_error "unexpected argument: $1"

upgrade_target=$(upgrade_target_ref "$upgrade_version")
install_root=$(upgrade_install_root)

coderail_archive_upgrade_target "$upgrade_target" "$install_root"
