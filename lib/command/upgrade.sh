#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../.."
    pwd
)

CODERAIL_COMMAND=cr
INSTALL_MARKER=.coderail-install

. "$ROOT_DIR/lib/utils/get-absolute-path.sh"
. "$ROOT_DIR/lib/utils/get-link-target-path.sh"

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

get_upgrade_version() {
    if [ "$dev_mode" = true ]; then
        printf '%s\n' main
        return
    fi

    [ -n "$version" ] || {
        printf '%s\n' latest
        return
    }

    case "$version" in
        v*) printf '%s\n' "$version" ;;
        *) printf 'v%s\n' "$version" ;;
    esac
}

find_current_cr_link_dir() {
    old_ifs=$IFS
    IFS=:
    set -- ${PATH:-}
    IFS=$old_ifs

    for path_dir do
        [ -n "$path_dir" ] || path_dir=.

        candidate_cr_link="$path_dir/$CODERAIL_COMMAND"
        [ -L "$candidate_cr_link" ] || continue
        [ -x "$candidate_cr_link" ] || continue

        rel_link_target=$(get_link_target_path "$candidate_cr_link")
        link_target=$(get_absolute_path "$rel_link_target")
        [ "$link_target" = "$ROOT_DIR/bin/$CODERAIL_COMMAND" ] || continue

        get_absolute_path "$path_dir"
        return
    done
}

run_upgrade() {
    [ -f "$ROOT_DIR/$INSTALL_MARKER" ] || error "upgrade requires an installed CodeRail home"
    [ -f "$ROOT_DIR/INSTALL" ] || error "INSTALL is not installed; reinstall CodeRail manually"

    upgrade_version=$(get_upgrade_version)
    coderail_bin_dir=$(find_current_cr_link_dir)

    if [ -n "$coderail_bin_dir" ]; then
        CODERAIL_HOME="$ROOT_DIR" \
        CODERAIL_BIN_DIR="$coderail_bin_dir" \
        CODERAIL_VERSION="$upgrade_version" \
        sh "$ROOT_DIR/INSTALL"
    else
        CODERAIL_HOME="$ROOT_DIR" \
        CODERAIL_VERSION="$upgrade_version" \
        sh "$ROOT_DIR/INSTALL"
    fi
}

option_set=false
version=
dev_mode=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
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

run_upgrade
