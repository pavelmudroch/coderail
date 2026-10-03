#!/usr/bin/env sh

path_is_absolute()
{
    path="$1"
    case "$path" in
        /*) return 0 ;;
        *) return 1 ;;
    esac
}

path_is_within()
{
    root="$1"
    path="$2"

    [ "$path" = "$root" ] && return 0

    case "$path" in
        "$root"/*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

path_normalize_relative()
{
    path="$1"

    case $path in
        '')  return 1 ;;
        /*)  return 1 ;;
    esac

    CR_NORMALIZE_PATH=$path awk '
        BEGIN {
            path = ENVIRON["CR_NORMALIZE_PATH"]
            n = split(path, parts, "/")
            depth = 0

            for (i = 1; i <= n; i++) {
                part = parts[i]

                if (part == "" || part == ".")
                    continue

                if (part == "..") {
                    if (depth == 0)
                        exit 1

                    depth--
                    continue
                }

                stack[++depth] = part
            }

            if (depth == 0) {
                print "."
                exit
            }

            result = stack[1]
            for (i = 2; i <= depth; i++)
                result = result "/" stack[i]

            print result
        }
    '
}

# Resolve an absolute destination whose final components may not exist yet.
path_destination_root()
(
    [ "$#" -eq 1 ] || exit 1
    destination=$1
    tab=$(printf '\t')
    newline='
'
    case "$destination" in
        /*) ;;
        *) exit 1 ;;
    esac
    while [ "$destination" != / ] && [ "${destination%/}" != "$destination" ]; do
        destination=${destination%/}
    done
    case "$destination" in
        *"$tab"*|*"$newline"*|*//*|*/./*|*/../*|*/.|*/..) exit 1 ;;
    esac

    probe=$destination
    missing=
    while [ ! -e "$probe" ] && [ ! -L "$probe" ]; do
        component=${probe##*/}
        if [ -n "$missing" ]; then
            missing=$component/$missing
        else
            missing=$component
        fi
        parent=$(dirname "$probe") || exit 1
        [ "$parent" != "$probe" ] || exit 1
        probe=$parent
    done
    [ -d "$probe" ] && [ ! -L "$probe" ] || exit 1
    parent=$(CDPATH= cd -P "$probe" 2>/dev/null && pwd) || exit 1
    if [ -n "$missing" ]; then
        printf '%s/%s\n' "$parent" "$missing"
    else
        printf '%s\n' "$parent"
    fi
)

path_safe_parent()
(
    [ "$#" -eq 2 ] || exit 1
    parent=$(dirname "$1") || exit 1
    while :; do
        [ ! -L "$parent" ] || exit 1
        if [ -e "$parent" ]; then
            [ -d "$parent" ] || exit 1
        fi
        [ "$parent" = "$2" ] && exit 0
        [ "$parent" != / ] || exit 0
        parent=$(dirname "$parent") || exit 1
    done
)

path_ensure_directory()
(
    [ "$#" -eq 1 ] || exit 1
    directory=$1
    [ "$directory" = / ] && exit 0
    [ ! -L "$directory" ] || exit 1
    if [ -e "$directory" ]; then
        [ -d "$directory" ]
        exit
    fi
    parent=$(dirname "$directory") || exit 1
    path_ensure_directory "$parent" || exit 1
    mkdir "$directory" 2>/dev/null || exit 1
    [ -d "$directory" ] && [ ! -L "$directory" ]
)

path_checksum()
{
    [ "$#" -eq 1 ] || return 1

    file="$1"
    [ -f "$file" ] && [ ! -L "$file" ] && [ -r "$file" ] || return 1

    checksum_result=$(cksum 2>/dev/null < "$file") || return 1
    case "$checksum_result" in
        *' '*)
            checksum=${checksum_result%% *}
            byte_length=${checksum_result#* }
            ;;
        *)
            return 1
            ;;
    esac

    case "$checksum" in
        ''|*[!0-9]*) return 1 ;;
    esac
    case "$byte_length" in
        ''|*' '*|*[!0-9]*) return 1 ;;
    esac

    printf '%s %s\n' "$checksum" "$byte_length"
}

path_locate_executable()
{
    executable="$1"
    if ! executable="$(command -v "$executable" 2>/dev/null)"; then
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
