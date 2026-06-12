#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/.."
    pwd
)

: "${HOME:?HOME is required}"

CODERAIL_HOME="${CODERAIL_HOME:-$HOME/.coderail}"

error() {
    echo "error: $*" >&2
    exit 1
}

find_user_bin_dir() {
    old_ifs=$IFS
    IFS=:
    set -- ${PATH:-}
    IFS=$old_ifs

    for path_dir do
        [ -n "$path_dir" ] || continue

        path_dir=$(sh "$SCRIPT_DIR/utils/absolute-path.sh" "$path_dir")

        [ "$path_dir" = "$HOME/.local/bin" ] || [ "$path_dir" = "$HOME/bin" ] || continue

        if [ -d "$path_dir" ]; then
            [ -w "$path_dir" ] || continue
        else
            parent_dir=$(dirname "$path_dir")
            [ -d "$parent_dir" ] && [ -w "$parent_dir" ] || continue
        fi

        printf '%s\n' "$path_dir"
        return
    done

    return 1
}

ensure_writable_dir() {
    dir=$1

    mkdir -p "$dir"

    [ -d "$dir" ] || error "$dir is not a directory"
    [ -w "$dir" ] || error "$dir is not writable"
}

get_current_cr_link() {
    current_cr=$(command -v cr 2>/dev/null || true)

    case "$current_cr" in
        */*) sh "$SCRIPT_DIR/utils/absolute-path.sh" "$current_cr" ;;
    esac
}

get_available_cr_link_dir() {
    if [ -n "${CODERAIL_BIN_DIR:-}" ]; then
        sh "$SCRIPT_DIR/utils/absolute-path.sh" "$CODERAIL_BIN_DIR"
        return
    fi

    user_bin_dir=$(find_user_bin_dir) || error "no writable standard user bin directory found in PATH; set CODERAIL_BIN_DIR"
    printf '%s\n' "$user_bin_dir"
}

install_home=$(sh "$SCRIPT_DIR/utils/absolute-path.sh" "$CODERAIL_HOME")
install_parent=$(dirname "$install_home")
current_cr_link=$(get_current_cr_link)
cr_link_dir=$(get_available_cr_link_dir)
cr_link="$cr_link_dir/cr"

[ "$install_home" != "/" ] || error "CODERAIL_HOME cannot be /"
[ "$install_home" != "$HOME" ] || error "CODERAIL_HOME cannot be HOME"
[ "$install_home" != "$ROOT_DIR" ] || error "CODERAIL_HOME must differ from source directory"

case "$install_home/" in
    "$ROOT_DIR"/*) error "CODERAIL_HOME cannot be inside source directory" ;;
esac

[ -f "$ROOT_DIR/bin/cr" ] || error "source does not contain bin/cr"

ensure_writable_dir "$install_parent"
ensure_writable_dir "$cr_link_dir"

if [ -n "$current_cr_link" ] && [ -e "$current_cr_link" ] && [ ! -L "$current_cr_link" ]; then
    error "$current_cr_link exists and is not a symlink"
fi

if [ -e "$cr_link" ] && [ ! -L "$cr_link" ]; then
    error "$cr_link exists and is not a symlink"
fi

rm -rf "$install_home"
mv "$ROOT_DIR" "$install_home"

if [ -n "$current_cr_link" ]; then
    rm -f "$current_cr_link"
fi

if [ -L "$cr_link" ]; then
    rm -f "$cr_link"
fi

ln -s "$install_home/bin/cr" "$cr_link"
chmod +x "$install_home/bin/cr"

echo "Installed coderail to $install_home"
echo "Linked cr to $cr_link"
