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

CODERAIL_COMMAND="cr"
CODERAIL_HOME="${CODERAIL_HOME:-$HOME/.coderail}"
INSTALL_MARKER=.coderail-install

. "$SCRIPT_DIR/utils/get-absolute-path.sh"
. "$SCRIPT_DIR/utils/get-link-target-path.sh"

error() {
    echo "error: $*" >&2
    rollback_installation
    exit 1
}

ensure_writable_dir() {
    dir=$1

    mkdir -p "$dir" || error "Failed to create '$dir'."

    [ -d "$dir" ] || error "$dir is not a directory"
    [ -w "$dir" ] || error "$dir is not writable"
}

is_codrail_home_directory() {
    dir=$1

    [ -d "$dir" ] || return 1
    [ -z "$(ls -A "$dir")" ] || [ -f "$dir/$INSTALL_MARKER" ] || return 1
}

is_path_contain_dir() {
    dir=$1
    old_ifs=$IFS
    IFS=:
    set -- ${PATH:-}
    IFS=$old_ifs

    for path_dir do
        [ "$path_dir" = "$dir" ] && return 0
    done

    return 1
}

ask_create_home_bin_dir() {
    home_bin_dir="$HOME/bin"

    echo "No writable user bin directory found in PATH." >&2
    printf 'Create %s for the cr symlink? [y/N] ' "$home_bin_dir" >&2

    answer=
    read answer || true

    case "$answer" in
        y|Y|yes|YES)
            mkdir -p "$home_bin_dir" || error "Failed to create '$home_bin_dir'."
            echo "Add $home_bin_dir to PATH to run cr from your shell." >&2
            printf '%s\n' "$home_bin_dir"
            ;;
        *)
            error "set CODERAIL_BIN_DIR or add $home_bin_dir to PATH"
            ;;
    esac
}

get_available_cr_link_dir() {
    if [ -n "${CODERAIL_BIN_DIR:-}" ]; then
        absolute_coderail_bin_dir=$(get_absolute_path "$CODERAIL_BIN_DIR")
        printf '%s\n' "$absolute_coderail_bin_dir"
        return
    fi

    if is_path_contain_dir "$HOME/bin"; then
        printf '%s\n' "$HOME/bin"
        return
    fi

    if is_path_contain_dir "$HOME/.local/bin"; then
        printf '%s\n' "$HOME/.local/bin"
        return
    fi

    ask_create_home_bin_dir
}

find_cr_link_in_path() {
    old_cr_link=""
    old_ifs=$IFS
    IFS=:
    set -- ${PATH:-}
    IFS=$old_ifs

    for path_dir do
        [ -n "$path_dir" ] || path_dir=.

        candidate_cr_link="$path_dir/$CODERAIL_COMMAND"
        [ -x "$candidate_cr_link" ] || continue

        absolute_candidate_cr_link=$(get_absolute_path "$candidate_cr_link")
        [ "$absolute_candidate_cr_link" = "$old_cr_link" ] && continue

        if [ -n "$old_cr_link" ]; then
            error "Multiple '$CODERAIL_COMMAND' commands found in PATH: '$old_cr_link' and '$absolute_candidate_cr_link'. Remove duplicates or set CODERAIL_BIN_DIR."
        fi

        old_cr_link=$absolute_candidate_cr_link
    done

    if [ -n "$old_cr_link" ] && [ "$old_cr_link" != "$cr_link" ]; then
        error "Existing '$CODERAIL_COMMAND' command at '$old_cr_link' differs from install target '$cr_link'. Remove it, reorder PATH, or set CODERAIL_BIN_DIR."
    fi
}

rollback_installation() {
    rollback_successful=true

    if [ "${cr_link_created:-false}" = true ] && [ -n "${cr_link:-}" ] && [ -L "$cr_link" ]; then
        rel_cr_link_target=$(get_link_target_path "$cr_link")
        cr_link_target=$(get_absolute_path "$rel_cr_link_target")
        if [ "$cr_link_target" = "${install_target_dir:-}/bin/$CODERAIL_COMMAND" ]; then
            if ! rm -f "$cr_link"; then
                rollback_successful=false
                echo "Failed to remove new '$CODERAIL_COMMAND' link at '$cr_link'." >&2
            fi
        fi
    fi

    if [ -n "${backup_target_dir:-}" ] && [ -d "$backup_target_dir" ]; then
        if ! rm -rf "$install_target_dir"; then
            rollback_successful=false
            echo "Failed to remove failed install contents at '$install_target_dir'." >&2
        elif ! mv "$backup_target_dir" "$install_target_dir"; then
            rollback_successful=false
            echo "Failed to restore backup contents from '$backup_target_dir' to '$install_target_dir'." >&2
        fi
    elif [ "${install_target_dir_created:-false}" = true ] && [ -d "$install_target_dir" ]; then
        if ! rm -rf "$install_target_dir"; then
            rollback_successful=false
            echo "Failed to remove failed install contents at '$install_target_dir'." >&2
        fi
    fi

    if [ -n "${backup_old_cr_link:-}" ] && [ -L "$backup_old_cr_link" ]; then
        if ! mv "$backup_old_cr_link" "$old_cr_link"; then
            rollback_successful=false
            echo "Failed to restore backup 'cr' link from '$backup_old_cr_link' to '$old_cr_link'." >&2
        fi
    fi

    if ! $rollback_successful; then
        echo "Rollback encountered errors. Current backup directory: ${backup_directory:-unknown}" >&2
        exit 1
    fi

    cleanup
}

is_valid_cr_link() {
    link=$(get_absolute_path "$1")

    [ -L "$link" ] || return 1
    rel_link_target=$(get_link_target_path "$link")
    link_target=$(get_absolute_path "$rel_link_target")
    bin_dir=$(dirname "$link_target")
    target_dir=$(dirname "$bin_dir")
    [ -f "$target_dir/$INSTALL_MARKER" ] || return 1
    return 0
}

cleanup() {
    if [ -d "${backup_directory:-}" ]; then
        rm -rf "$backup_directory"
    fi
}

install_target_dir=$(get_absolute_path "$CODERAIL_HOME")
install_target_basename=$(basename "$install_target_dir")
backup_target_dir=""
install_target_dir_created=false

old_cr_link=""
backup_old_cr_link=""
cr_link_created=false

cr_link_target_dir=$(get_available_cr_link_dir)
cr_link="$cr_link_target_dir/$CODERAIL_COMMAND"
find_cr_link_in_path

backup_directory=$(mktemp -d)

if [ -n "$old_cr_link" ]; then
    if ! is_valid_cr_link "$old_cr_link"; then
        error "Existing '$CODERAIL_COMMAND' command at '$old_cr_link' is not a valid CodeRail link. Please remove or rename it before installing."
    fi

    backup_old_cr_link="$backup_directory/$CODERAIL_COMMAND"
    mv "$old_cr_link" "$backup_old_cr_link" || error "Failed to backup existing '$CODERAIL_COMMAND' link from '$old_cr_link' to '$backup_old_cr_link'."
fi

if [ -e "$install_target_dir" ]; then
    if ! is_codrail_home_directory "$install_target_dir"; then
        error "Cannot install to '$install_target_dir'. It is not empty or not a valid CodeRail home directory."
    fi

    backup_target_dir="$backup_directory/$install_target_basename"
    mv "$install_target_dir" "$backup_target_dir" || error "Failed to backup existing contents of '$install_target_dir'."
fi

if [ -e "$cr_link" ]; then
    error "Cannot create '$CODERAIL_COMMAND' link at '$cr_link'. A file or link already exists there."
fi

if [ -e "$install_target_dir" ]; then
    error "Cannot install to '$install_target_dir'. It already exists."
fi

install_target_dir_created=true
ensure_writable_dir "$install_target_dir"
ensure_writable_dir "$cr_link_target_dir"

cp -R "$ROOT_DIR/instructions" "$install_target_dir/" || error "Failed to install into '$install_target_dir'."
cp -R "$ROOT_DIR/bin" "$install_target_dir/" || error "Failed to install into '$install_target_dir'."
cp -R "$ROOT_DIR/lib" "$install_target_dir/" || error "Failed to install into '$install_target_dir'."
cp "$ROOT_DIR/INSTALL" "$install_target_dir/" || error "Failed to install into '$install_target_dir'."
touch "$install_target_dir/$INSTALL_MARKER" || error "Failed to install into '$install_target_dir'."
ln -s "$install_target_dir/bin/$CODERAIL_COMMAND" "$cr_link" || error "Failed to install '$CODERAIL_COMMAND' command."
cr_link_created=true
chmod +x "$cr_link" || error "Failed to install '$CODERAIL_COMMAND' command."

cleanup
