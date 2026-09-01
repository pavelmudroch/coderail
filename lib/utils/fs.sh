#!/usr/bin/env sh

fs_safely_init_dir()
{
    dirname="$1"

    log_verbose "Creating \"$dirname\" directory."
    if [ -d "$dirname" ]; then
        log_verbose "Directory \"$dirname\" already exists."
    else
        if ! error=$(mkdir -p "$dirname" 2>&1); then
            echo "Failed to create \"$dirname\" directory.${NL}> $error"
            return 1
        fi
    fi
}

fs_safely_init_file()
{
    path="$1"
    content="$2"

    log_verbose "Creating \"$path\" file."
    if [ -e "$path" ]; then
        log_verbose "File \"$path\" already exists."
        return 0
    fi

    case $path in
        */*) dir=${path%/*} ;;
        *)   dir=. ;;
    esac

    file=$(basename "$path")

    if ! error=$(
        {
            echo "$content" > "$tmp_dir/$file" &&
                mkdir -p "$dir" &&
                mv "$tmp_dir/$file" "$path"
        } 2>&1
    ); then
        echo "Failed to create \"$path\" file.${NL}> $error"
        return 1
    fi
}

fs_safely_replace_dir()
{
    source_dir="$1"
    destination_dir="$2"
    log_verbose "Replacing \"$destination_dir\" directory."

    if [ ! -d "$source_dir" ]; then
        echo "Source directory does not exist: \"$source_dir\""
        return 1
    fi

    if [ -d "$destination_dir" ]; then
        backup_dir="${destination_dir}_backup_$(date +%s)"
        if ! error=$(mv "$destination_dir" "$backup_dir" 2>&1); then
            echo "Failed to backup \"$destination_dir\" directory.${NL}> $error"
            return 1
        fi
    fi

    if ! error=$(mv "$source_dir" "$destination_dir" 2>&1); then
        echo "Failed to replace \"$destination_dir\" directory.${NL}> $error"
        if [ -d "$backup_dir" ]; then
            mv "$backup_dir" "$destination_dir"
        fi
        return 1
    fi
}

fs_safely_replace_file()
{
    source_path="$1"
    destination_path="$2"
    log_verbose "Replacing \"$destination_path\" file."

    if [ ! -e "$source_path" ]; then
        echo "Source file does not exist: \"$source_path\""
        return 1
    fi

    if ! error=$(mv -f "$source_path" "$destination_path" 2>&1); then
        echo "Failed to replace \"$destination_path\" file.${NL}> $error"
        return 1
    fi
}
