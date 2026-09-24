#!/usr/bin/env sh

set -eu

CODERAIL_INSTALL_REPO_URL=https://github.com/pavelmudroch/coderail

_get_install_target_url()
{
    install_ref=$1

    case "$install_ref" in
        main)
            printf '%s/archive/refs/heads/main.tar.gz\n' "$CODERAIL_INSTALL_REPO_URL"
            ;;
        latest|v*)
            printf '%s/archive/refs/tags/%s.tar.gz\n' "$CODERAIL_INSTALL_REPO_URL" "$install_ref"
            ;;
        *)
            printf 'Unsupported install ref: %s\n' "$install_ref"
            return 1
            ;;
    esac
}

_download_install_target()
{
    url="$1"
    destination="$2"

    if command -v curl >/dev/null 2>&1; then
        if ! message=$(curl -fsSL "$url" -o "$destination" 2>&1); then
            printf '%s\n' "$message"
            return 1
        fi
        return 0
    fi

    if command -v wget >/dev/null 2>&1; then
        if ! message=$(wget -q -O "$destination" "$url" 2>&1); then
            printf '%s\n' "$message"
            return 1
        fi
        return 0
    fi

    printf 'Missing required "curl" or "wget" tool\n'
}

_validate_downloaded_install_target()
{
    return 0
}

temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

cr_install_dir=${CODERAIL_INSTALL_DIR:-"$HOME/.coderail"}
cr_install_version=${CODERAIL_INSTALL_VERSION:-latest}

printf 'Downloading archive for version: %s...\n' "$cr_install_version"
if ! cr_install_target_url=$(_get_install_target_url "$cr_install_version"); then
    printf 'error: Failed to download archive: %s\n' "$cr_install_target_url"
    exit 1
fi

if ! message=$(_download_install_target "$cr_install_target_url" "$temp_dir/archive.tar.gz"); then
    printf 'error: Failed to download target: %s\n' "$cr_install_target_url"
    exit 1
fi

printf 'Extracting archive...\n'
if ! command -v tar >/dev/null 2>&1; then
    printf 'error: Missing required "tar" tool\n'
    exit 1
fi

if ! tar -xzf "$temp_dir/archive.tar.gz" -C "$temp_dir"; then
    printf 'error: Failed to extract archive\n'
    exit 1
fi

cr_source_dir=""
for candidate in "$temp_dir"/*; do
    if [ -x "$candidate/bin/cr" ]; then
        cr_source_dir="$candidate"
        break
    fi
done

if [ -z "$cr_source_dir" ]; then
    printf 'error: Upgrade tool not found in the archive\n'
    exit 1
fi
cr_upgrade_tool="$cr_source_dir/bin/cr"

printf 'Installing coderail to %s...\n' "$cr_install_dir"
if ! CODERAIL_INTERNAL_INSTALL=1 \
    CODERAIL_INTERNAL_SOURCE="$cr_source_dir" \
    CODERAIL_INTERNAL_DESTINATION="$cr_install_dir" \
    CODERAIL_INTERNAL_ORIGIN=install \
    "$cr_upgrade_tool" upgrade --yes; then
    printf 'error: Failed to install coderail\n'
    exit 1
fi

printf 'Coderail installed successfully!\n'

_locate_cr_executable()
{
    if ! executable="$(command -v "cr" 2>/dev/null)"; then
        return 1
    fi

    while [ -L "$executable" ]; do
        exec_dir=$(
            CDPATH= cd -- "$(dirname "$executable")"
            pwd
        )
        link_target=$(readlink "$executable")

        case "$link_target" in
            /*) executable="$link_target" ;;
            *) executable="$exec_dir/$link_target" ;;
        esac
    done

    printf '%s\n' "$executable"
}

if ! current_cr_executable=$(_locate_cr_executable); then
    printf '\n"cr" tool is not located in your PATH\n'
    printf 'Add %s to your PATH or link it to a directory\nalready in your PATH\n' "$cr_install_dir/bin"
    printf '\nExample:\n  export PATH="%s/bin:$PATH"\n' "$cr_install_dir"
fi

if [ "$current_cr_executable" != "$cr_install_dir/bin/cr" ]; then
    printf '\n"cr" tool in your PATH (%s) does not match the installed location (%s)\n' "$current_cr_executable" "$cr_install_dir/bin/cr"
fi
