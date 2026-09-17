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
