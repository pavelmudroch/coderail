#!/usr/bin/env sh

get_absolute_path() {
    path=$1

    if [ -d "$path" ]; then
        absolute_path_result=$(
            CDPATH= cd -- "$path" 2>/dev/null
            pwd
        ) || return 1
        printf '%s\n' "$absolute_path_result"
        return 0
    fi

    path_dir=$(dirname "$path")
    path_base=$(basename "$path")
    absolute_path_dir_result=$(
        CDPATH= cd -- "$path_dir" 2>/dev/null
        pwd
    ) || return 1
    printf '%s/%s\n' "$absolute_path_dir_result" "$path_base"
}