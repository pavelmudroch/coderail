#!/usr/bin/env sh

fs_temp_dir_at()
{
    target="$1"

    i=0
    temp_dir_created=0
    while [ $i -lt 100 ]; do
        temp_dir="$target/.cr-tmp-$$-$i"
        if mkdir "$temp_dir" 2>/dev/null; then
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
    temp_dir=$(fs_temp_dir_at "$parent") || return 1

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

    if [ ! -f "$source" ]; then
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