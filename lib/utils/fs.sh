#!/usr/bin/env sh

fs_safely_init_dir()
{
    dirname="$1"

    if [ -d "$dirname" ]; then
        log_verbose "The $dirname directory already exists."
    else
        if error=$(mkdir -p "$dirname" 2>&1); then
            log_verbose "Created $dirname directory."
        else
            log_error "Failed to create $dirname directory.${NL}> $error"
            return 1
        fi
    fi
}

fs_safely_init_file()
{
    path="$1"
    content="$2"

    if [ -e "$path" ]; then
        log_verbose "The $path file already exists."
        return 0
    fi

    case $path in
        */*) dir=${path%/*} ;;
        *)   dir=. ;;
    esac

    file=$(basename "$path")

    if error=$(
        {
            echo "$content" > "$tmp_dir/$file" &&
                mkdir -p "$dir" &&
                mv "$tmp_dir/$file" "$path"
        } 2>&1
    ); then
        log_verbose "Created $path file."
    else
        log_error "Failed to create $path file.${NL}> $error"
        return 1
    fi
}
