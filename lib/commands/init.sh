#!/usr/bin/env sh

set -eu

script_path=$0

while [ -L "$script_path" ]; do
    script_dir=$(
        CDPATH= cd -- "$(dirname "$script_path")"
        pwd
    )
    link_target=$(readlink "$script_path")

    case "$link_target" in
        /*) script_path=$link_target ;;
        *) script_path=$script_dir/$link_target ;;
    esac
done

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$script_path")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../.."
    pwd
)

. "$ROOT_DIR/lib/utils/log.sh"

usage() {
    cat <<'EOF'
Usage:
  cr init [options]

  Initialize current working directory for coderail agent-based development.

  Initialization will create a .coderail directory filled with template
  configuration files for the project. And ticket management directory.

Options:
  -h, --help            Show this help message and exit
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
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

create_dir() {
    target_dir=$1

    [ ! -e "$target_dir" ] || return 0

    log_notice "creating $target_dir"
    mkdir -p "$target_dir"
}

create_file() {
    target_file=$1

    [ ! -e "$target_file" ] || return 0

    log_notice "creating $target_file"
    cat > "$target_file"
}

log_info "Initializing current working directory for coderail agent-based development"
log_notice "current working directory: $PWD"
create_dir .coderail
create_dir .coderail/tickets
create_file .coderail/conf.ini <<'EOF'
# characters after '#' are comments
# default_tool = codex # set the default tool for cr
EOF
create_file .coderail/test.map <<'EOF'
# characters after '#' are comments

[default]
# Add commands that run always
# biome lint {path} - use dynamic {path} for substitution of current test file path
EOF
