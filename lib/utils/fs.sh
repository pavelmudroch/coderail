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
    echo "$target"
}

fs_temp_dir_at  ()
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

fs_temp_for()
{
    target="$1"
    parent=$(dirname "$target") || return 1

    [ "$parent" = "$target" ] && parent="."
    temp_dir=$(fs_temp_dir_at "$parent" "$target") || return 1

    temp_file="$temp_dir/file"
    if ! : >"$temp_file"; then
        rmdir "$temp_dir" 2>/dev/null
        return 1
    fi

    printf "%s\n" "$temp_file"
}

fs_replace()
{
    source="$1"
    destination="$2"

    if [ ! -e "$source" ] && [ ! -L "$source" ]; then
        return 1
    fi

    mv "$source" "$destination" 2>/dev/null
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
    temp=$(fs_temp_for "$target") || return 1
    cat >"$temp" 2>/dev/null || return 1
    fs_replace "$temp" "$target"
}