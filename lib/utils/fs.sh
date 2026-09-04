#!/usr/bin/env sh

_fs_find_first_existing_parent()
{
    target="$1"
    if [ -f "$target" ] || [ -L "$target" ]; then
        target=$(dirname "$target")
    fi

    while [ ! -d "$target" ]; do
        parent=$(dirname "$target")
        [ "$target" = "$parent" ] && break
        target="$parent"
    done
    echo "${target%/}"
}

_fs_temp_dir_at  ()
{
    target="$1"
    name=${2:-.cr-tmp}

    i=0
    temp_dir_created=0
    while [ $i -lt 100 ]; do
        temp_dir="$target/$name-$$-$i"
        if mkdir -p "$temp_dir" 2>/dev/null; then
            temp_dir_created=1
            break
        fi
        i=$((i + 1))
    done

    if [ $temp_dir_created -eq 0 ]; then
        return 1
    fi
    register_temp_resource "$temp_dir"

    printf "%s\n" "$temp_dir"
}

fs_replace()
{
    source="$1"
    destination="$2"

    if [ ! -e "$source" ] && [ ! -L "$source" ]; then
        return 1
    fi

    mv -f "$source" "$destination" 2>/dev/null
}

fs_remove()
{
    target="$1"

    [ -e "$target" ] || [ -L "$target" ] || return 0
    rm -rf "$target" 2>/dev/null
}

fs_make_dir()
{
    target="$1"
    mkdir -p "$target" 2>/dev/null || return 1
}

fs_write()
{
    target="$1"
    target="${target%/}"
    parent=$(dirname "$target") || return 1
    if [ "$target" = "$parent" ]; then
        return 1
    fi
    temp=$(_fs_temp_dir_at "$parent") || return 1
    cat >"$temp/file" 2>/dev/null || return 1
    fs_replace "$temp/file" "$target"
}

fs_temp_for_dir()
{
    target="$1"
    if [ -e "$target" ]; then
        [ ! -d "$target" ] && return 1
        parent=$(dirname "$target") || return 1
        temp_dir=$(_fs_temp_dir_at "$parent") || return 1
        cp -r "$target/." "$temp_dir/" 2>/dev/null || return 1
        echo "$target" >"$temp_dir/.~cr-replace.lock" 2>/dev/null || return 1

        printf "%s\n" "$temp_dir"
    else
        [ -L "$target" ] && return 1
        parent=$(_fs_find_first_existing_parent "$target") || return 1
        temp_dir=$(_fs_temp_dir_at "$parent") || return 1
        children="${target#$parent}"
        children="${children#/}"
        clone="${children%%/*}"
        children="${children#"$clone"}"
        children="${children#/}"
        mkdir -p "$temp_dir/$children" 2>/dev/null || return 1
        echo "$parent/$clone" >"$temp_dir/.~cr-replace.lock" 2>/dev/null || return 1

        printf "%s\n" "$temp_dir/$children"
    fi
}

fs_stage_temp_dir()
{
    temp_dir="$1"
    while [ ! -e "$temp_dir/.~cr-replace.lock" ]; do
        temp_dir=$(dirname "$temp_dir") || return 1
    done
    target=$(cat "$temp_dir/.~cr-replace.lock") 2>/dev/null || return 1
    rm -f "$temp_dir/.~cr-replace.lock" 2>/dev/null
    cp -rf "$temp_dir/." "$target/" 2>/dev/null || return 1
}