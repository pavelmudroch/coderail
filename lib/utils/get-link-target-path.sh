#!/usr/bin/env sh

get_link_target_path() {
    path=$1

    while [ -L "$path" ]; do
        link_target=$(readlink "$path")
        # if link_target is absolute, use it directly; if it's relative, resolve it against the directory of the link
        case "$link_target" in
            /*) path="$link_target" ;;
            *) path="$(dirname "$path")/$link_target" ;;
        esac
    done

    printf '%s\n' "$path"
}